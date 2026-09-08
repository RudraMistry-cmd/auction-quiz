const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const ClientIO = require('../client/node_modules/socket.io-client');
const { getDb } = require('./dist/db/database.js');
const { questionService } = require('./dist/services/question.service.js');
const { auctionService } = require('./dist/services/auction.service.js');
const { taskService } = require('./dist/services/task.service.js');
const { teamService } = require('./dist/services/team.service.js');
const { setupSocketHandlers } = require('./dist/handlers/socket.handler.js');
const { ADMIN_SECRET } = require('./dist/auth.js');
const fs = require('fs');

async function run() {
  console.log('=== Verifying task time_limit from Excel & task:started event ===');
  const db = await getDb();

  // Reset db state
  db.run('DELETE FROM questions');
  db.run('DELETE FROM auctions');
  db.run('DELETE FROM tasks');
  db.run('DELETE FROM bids');
  db.run('DELETE FROM teams');
  db.run('DELETE FROM settings');

  // 1. Import Excel with questions
  const fileBuf = fs.readFileSync('../docs/quiz-questions.xlsx');
  const importRes = await questionService.importExcel(fileBuf, 'overwrite');
  console.log('Imported questions from Excel:', importRes.imported);

  const pools = await questionService.getPools();
  const q60 = pools.easy.find(q => q.time_limit === 60);
  const q180 = pools.hard.find(q => q.time_limit === 180);

  if (!q60 || !q180) {
    throw new Error('Expected to find questions with time_limit 60s and 180s');
  }
  console.log('Found Q60:', { id: q60.id, time_limit: q60.time_limit });
  console.log('Found Q180:', { id: q180.id, time_limit: q180.time_limit });

  // 2. Setup server & socket
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  const socketHandlers = setupSocketHandlers(io);

  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  console.log('Test server listening on port', port);

  // Connect admin socket
  const adminClient = ClientIO('http://127.0.0.1:' + port, { transports: ['websocket'] });
  await new Promise(r => adminClient.on('connect', r));
  await new Promise(r => adminClient.emit('admin:auth', { secret: ADMIN_SECRET }, r));

  // Connect team socket
  const teamClient = ClientIO('http://127.0.0.1:' + port, { transports: ['websocket'] });
  await new Promise(r => teamClient.on('connect', r));
  const regRes = await new Promise(r => teamClient.emit('client:register', {
    teamName: 'TimeLimitTeam',
    player1: 'Alice',
    player2: 'Bob',
    phone: '1234567890',
    email: 'alice@test.com'
  }, r));
  console.log('Registered team:', regRes.team.teamName);

  // Listen for task:started on teamClient
  let lastTaskStarted = null;
  teamClient.on('task:started', (data) => {
    lastTaskStarted = data;
    console.log('--> Event task:started received:', data);
  });

  // --- Test Flow 1: Question with 60s time_limit ---
  console.log('\n--- Test Flow 1: Question with 60s time_limit ---');
  await questionService.selectQuestion(q60.id);
  const auction1 = await socketHandlers.startAuction();
  console.log('Started auction for Q60:', auction1.auctionId);

  // Place bid
  await new Promise(r => teamClient.emit('client:bid', { auctionId: auction1.auctionId }, r));

  // End auction immediately to trigger task creation
  lastTaskStarted = null;
  const endResult1 = await auctionService.endAuction();
  console.log('Auction ended, winner:', endResult1.winner.teamName);

  // Wait for task:started event to fire
  for (let i = 0; i < 20 && !lastTaskStarted; i++) {
    await new Promise(r => setTimeout(r, 100));
  }

  if (!lastTaskStarted) {
    throw new Error('Flow 1 Failed: task:started was not emitted');
  }

  console.log('Validating task:started payload for 60s question:');
  console.log('time_limit:', lastTaskStarted.time_limit);
  console.log('endAt:', lastTaskStarted.endAt);

  if (lastTaskStarted.time_limit !== 60) {
    throw new Error('Flow 1 Failed: Expected time_limit to be 60, got ' + lastTaskStarted.time_limit);
  }

  const expectedEndAt60 = Date.now() + 60 * 1000;
  const diff60 = Math.abs(lastTaskStarted.endAt - expectedEndAt60);
  console.log('Difference between endAt and now + 60s:', diff60, 'ms');
  if (diff60 > 3000) {
    throw new Error('Flow 1 Failed: endAt deviates too much from expected 60s deadline: ' + diff60 + 'ms');
  }

  const activeTask1 = taskService.getActiveTask();
  console.log('Active task time_limit in service:', activeTask1.time_limit);
  if (activeTask1.time_limit !== 60) {
    throw new Error('Flow 1 Failed: activeTask.time_limit in service is ' + activeTask1.time_limit);
  }

  // Test admin:task_start (re-starting task timer)
  console.log('\n--- Test Flow 1b: admin:task_start restarts with question time_limit (60s) ---');
  lastTaskStarted = null;
  const restartRes = await new Promise(r => adminClient.emit('admin:task_start', { taskId: activeTask1.taskId }, r));
  console.log('admin:task_start ack:', restartRes);
  if (restartRes.timeLeft !== 60) {
    throw new Error('Flow 1b Failed: restart ack timeLeft should be 60, got ' + restartRes.timeLeft);
  }

  for (let i = 0; i < 20 && !lastTaskStarted; i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  if (!lastTaskStarted || lastTaskStarted.time_limit !== 60) {
    throw new Error('Flow 1b Failed: task:started event on restart did not emit time_limit: 60');
  }
  console.log('PASS: admin:task_start restarts timer with 60s time_limit.');

  // Complete task 1
  await new Promise(r => adminClient.emit('admin:submit_result', {
    taskId: activeTask1.taskId,
    result: 'pass',
    rewardPoints: 10
  }, r));
  console.log('Submitted result for task 1');

  // --- Test Flow 2: Question with 180s time_limit ---
  console.log('\n--- Test Flow 2: Question with 180s time_limit ---');
  await questionService.selectQuestion(q180.id);
  const auction2 = await socketHandlers.startAuction();
  console.log('Started auction for Q180:', auction2.auctionId);

  await new Promise(r => teamClient.emit('client:bid', { auctionId: auction2.auctionId }, r));

  lastTaskStarted = null;
  const endResult2 = await auctionService.endAuction();
  console.log('Auction ended, winner:', endResult2.winner.teamName);

  for (let i = 0; i < 20 && !lastTaskStarted; i++) {
    await new Promise(r => setTimeout(r, 100));
  }

  if (!lastTaskStarted) {
    throw new Error('Flow 2 Failed: task:started was not emitted');
  }

  console.log('Validating task:started payload for 180s question:');
  console.log('time_limit:', lastTaskStarted.time_limit);
  console.log('endAt:', lastTaskStarted.endAt);

  if (lastTaskStarted.time_limit !== 180) {
    throw new Error('Flow 2 Failed: Expected time_limit to be 180, got ' + lastTaskStarted.time_limit);
  }

  const expectedEndAt180 = Date.now() + 180 * 1000;
  const diff180 = Math.abs(lastTaskStarted.endAt - expectedEndAt180);
  console.log('Difference between endAt and now + 180s:', diff180, 'ms');
  if (diff180 > 3000) {
    throw new Error('Flow 2 Failed: endAt deviates too much from expected 180s deadline: ' + diff180 + 'ms');
  }

  const activeTask2 = taskService.getActiveTask();
  console.log('Active task time_limit in service:', activeTask2.time_limit);
  if (activeTask2.time_limit !== 180) {
    throw new Error('Flow 2 Failed: activeTask.time_limit in service is ' + activeTask2.time_limit);
  }

  console.log('\nPASS: All test flows passed! Timers matched Excel time_limit configuration.');

  // Clean up
  adminClient.close();
  teamClient.close();
  await new Promise(r => server.close(r));
  process.exit(0);
}

run().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});

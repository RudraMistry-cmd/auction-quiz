import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeContext";
import TeamScreen from "./pages/TeamScreen";
import AdminScreen from "./pages/AdminScreen";
import DisplayScreen from "./pages/DisplayScreen";
import LiveAuctionScreen from "./pages/LiveAuctionScreen";
import ScoreboardScreen from "./pages/ScoreboardScreen";
import { BrandHeader } from "./components/BrandHeader";
import { colors, fontFamily } from "./theme";
import { tokens } from "./design-system";
import "./App.css";

// Secret non-guessable control panel route.
// Teams cannot access or guess this route.
export const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET || "7f8a9b2c";
export const ADMIN_ROUTE = `/control-panel-${ADMIN_SECRET}`;

function App() {
  // NOTE: No audio logic here — sound playback lives ONLY in LiveAuctionScreen.
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/team" element={<TeamScreen />} />
        {/* Non-guessable control panel route */}
        <Route path={ADMIN_ROUTE} element={<AdminScreen adminSecret={ADMIN_SECRET} />} />
        <Route path="/display" element={<DisplayChooser />} />
        <Route path="/display/live" element={<LiveAuctionScreen />} />
        <Route path="/display/scores" element={<ScoreboardScreen />} />
        <Route path="/display/legacy" element={<DisplayScreen />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
    </ThemeProvider>
  );
}

function NotFound() {
  return (
    <div style={styles.home}>
      <h1 style={styles.homeTitle}>Page not found</h1>
      <p style={{ color: colors.muted }}>
        Pick a screen:
      </p>
      <div style={styles.links}>
        <Link to="/team" style={styles.link}>Team</Link>
        <Link to="/display" style={styles.link}>Display</Link>
      </div>
    </div>
  );
}

function DisplayChooser() {
  return (
    <div style={styles.home}>
      <BrandHeader variant="centered" subtitle="PROJECTOR DISPLAYS" />
      <div style={styles.links}>
        <Link to="/display/live" style={styles.link}>Display 1 — Live Auction</Link>
        <Link to="/display/scores" style={styles.link}>Display 2 — Scoreboard</Link>
      </div>
    </div>
  );
}

function Home() {
  return (
    <div style={styles.home}>
      <BrandHeader variant="centered" showTagline />
      <div style={styles.links}>
        <Link to="/team" style={styles.link}>Team</Link>
        <Link to="/display/live" style={styles.link}>Display 1 — Live</Link>
        <Link to="/display/scores" style={styles.link}>Display 2 — Scores</Link>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  home: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    color: colors.ink,
    fontFamily,
    gap: "2rem",
  },
  homeTitle: {
    fontSize: "3rem",
    fontWeight: 800,
    color: colors.gold,
  },
  links: {
    display: "flex",
    gap: "1.5rem",
  },
  link: {
    padding: "1rem 2rem",
    borderRadius: tokens.radius.lg,
    backgroundColor: colors.surface,
    color: colors.ink,
    textDecoration: "none",
    fontSize: "1.125rem",
    fontWeight: "bold",
    border: "none",
    boxShadow: tokens.shadow.sm,
  },
};

export default App;

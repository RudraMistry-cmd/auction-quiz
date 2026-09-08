import os from "os";

export const ADMIN_SECRET = process.env.ADMIN_SECRET || "7f8a9b2c";
export const ALLOW_REMOTE_ADMIN =
  process.env.ADMIN_RESTRICT_HOST_IP === "false" || process.env.ALLOW_REMOTE_ADMIN === "true";

/**
 * Check if the given remote IP address originates from localhost
 * or from the host machine's own network interfaces.
 */
export function isLocalOrHostIp(remoteAddress?: string): boolean {
  if (!remoteAddress) return false;

  // Normalize IPv6 prefix (e.g. ::ffff:192.168.1.9 -> 192.168.1.9)
  const ip = remoteAddress.replace(/^::ffff:/, "").toLowerCase().trim();

  // Localhost addresses
  if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost") {
    return true;
  }

  // Compare against all active network interfaces on the host machine
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        const ifaceIp = iface.address.replace(/^::ffff:/, "").toLowerCase().trim();
        if (ifaceIp === ip) {
          return true;
        }
      }
    }
  } catch (err) {
    console.warn("[Auth] Failed to read network interfaces for IP check:", err);
  }

  return false;
}

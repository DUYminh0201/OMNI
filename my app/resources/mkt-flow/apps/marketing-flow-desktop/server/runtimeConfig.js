export const DEVELOPMENT_SERVER_PORT = 3002;

export function resolveServerPort(env = process.env) {
  const configuredPort = Number.parseInt(env.PORT, 10);
  return Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65_535
    ? configuredPort
    : DEVELOPMENT_SERVER_PORT;
}

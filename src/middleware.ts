import { authMiddleware } from "./middleware/auth-middleware";

export default authMiddleware;

export const config = {
  // Re-enable middleware but be more permissive
  matcher: ["/dashboard/:path*"],
};

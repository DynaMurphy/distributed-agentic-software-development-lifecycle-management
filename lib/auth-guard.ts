import type { Session } from "next-auth";
import { ChatSDKError, type Surface } from "@/lib/errors";

/**
 * Returns a 403 Response if the session user is a guest.
 * Returns null if the user is authenticated (non-guest).
 */
export function guestWriteGuard(
  session: Session,
  surface: Surface
): Response | null {
  if (session.user.type === "guest") {
    return new ChatSDKError(`forbidden:${surface}`).toResponse();
  }
  return null;
}

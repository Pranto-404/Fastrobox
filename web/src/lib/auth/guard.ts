import { forbidden, redirect } from "next/navigation";
import { ApiError } from "../http";
import { currentUser, type Role, type SessionUser } from "./session";

/** For route handlers: 401 if not logged in, 403 (no data) if the role is not allowed. */
export async function requireApiUser(roles?: Role[]): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new ApiError(401, "unauthenticated", "Login required");
  if (roles && !roles.includes(user.role)) throw new ApiError(403, "forbidden", "Not allowed");
  return user;
}

/** For server components/pages: redirect to /login, or HTTP 403 (forbidden.tsx) for a wrong role. */
export async function requirePageUser(roles?: Role[]): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) forbidden();
  return user;
}

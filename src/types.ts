export type UserRole = "citizen" | "authority" | "contractor";

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
}

export interface AuthResponse {
  token: string;
  user: SessionUser;
}

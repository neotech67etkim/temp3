import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: Role;
    departmentId: string | null;
    divisionId: string | null;
    teamId: string | null;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      departmentId: string | null;
      divisionId: string | null;
      teamId: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    departmentId: string | null;
    divisionId: string | null;
    teamId: string | null;
  }
}

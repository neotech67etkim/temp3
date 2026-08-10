import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/db";

type AppTokenFields = {
  id: string;
  role: Role;
  departmentId: string | null;
  divisionId: string | null;
  teamId: string | null;
};

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const passwordValid = await bcrypt.compare(password, user.passwordHash);
        if (!passwordValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          departmentId: user.departmentId,
          divisionId: user.divisionId,
          teamId: user.teamId,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.departmentId = user.departmentId;
        token.divisionId = user.divisionId;
        token.teamId = user.teamId;
      }
      return token;
    },
    session({ session, token }) {
      const t = token as typeof token & AppTokenFields;
      session.user.id = t.id;
      session.user.role = t.role;
      session.user.departmentId = t.departmentId;
      session.user.divisionId = t.divisionId;
      session.user.teamId = t.teamId;
      return session;
    },
  },
});

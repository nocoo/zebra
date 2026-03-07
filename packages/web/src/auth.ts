/**
 * Auth.js v5 configuration for Zebra SaaS.
 *
 * Uses JWT strategy (no session table needed) with Google OAuth.
 * User data stored in Cloudflare D1 via custom adapter.
 */

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { D1AuthAdapter } from "@/lib/auth-adapter";
import { getD1Client } from "@/lib/d1";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: D1AuthAdapter(getD1Client()),
  providers: [Google],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    /** Persist user ID in JWT token. */
    jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
      }
      return token;
    },
    /** Expose user ID in session. */
    session({ session, token }) {
      if (token.userId && session.user) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});

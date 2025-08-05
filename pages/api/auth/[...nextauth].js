import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export default NextAuth({
  // — make sure you've set NEXTAUTH_SECRET in .env.local
  secret: process.env.NEXTAUTH_SECRET,

  // — use JWT sessions
  session: { strategy: "jwt" },

  // — configure Google OAuth
  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_ID,
      clientSecret: process.env.GOOGLE_SECRET,
    }),
  ],

  // — point to our custom sign-in page
  pages: {
    signIn: "/auth/signin",
  },

  callbacks: {
    // — pack the user.email into the token on first sign in
    async jwt({ token, user }) {
      if (user) token.user = { email: user.email };
      return token;
    },
    // — expose token.user on the client via session.user
    async session({ session, token }) {
      session.user = token.user;
      return session;
    },
    // — ensure only same-origin or relative URLs get used in redirects
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return baseUrl;
    },
  },
});

// pages/_app.js

// 1️⃣ Import your global CSS here
import "../styles/globals.css";

import { SessionProvider } from "next-auth/react";

export default function App({ Component, pageProps }) {
  return (
    <SessionProvider session={pageProps.session}>
      <Component {...pageProps} />
    </SessionProvider>
  );
}

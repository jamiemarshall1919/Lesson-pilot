// pages/auth/signin.js
import Head from "next/head";
import Image from "next/image";
import { getProviders, signIn } from "next-auth/react";
import styles from "./signin.module.css";

export default function SignIn({ providers, callbackUrl }) {
  return (
    <>
      <Head>
        <title>Sign in – Lesson Pilot</title>
      </Head>
      <div className={styles.container}>
        <div className={styles.card}>
          {/* Optional: drop your own logo at public/logo.svg */}
          <div className={styles.logo}>
            <Image
              src="/logo.svg"
              alt="Lesson Pilot Logo"
              width={64}
              height={64}
            />
          </div>
          <h1 className={styles.title}>Lesson Pilot</h1>
          <p className={styles.subtitle}>
            Sign in to create and manage your lesson plans
          </p>

          {providers &&
            Object.values(providers).map((provider) => (
              <button
                key={provider.id}
                className={styles.button}
                onClick={() =>
                  signIn(provider.id, { callbackUrl: callbackUrl || "/" })
                }
              >
                Sign in with {provider.name}
              </button>
            ))}
        </div>
      </div>
    </>
  );
}

export async function getServerSideProps(context) {
  const providers = await getProviders();
  const callbackUrl = context.query.callbackUrl || "/";
  return { props: { providers: providers ?? {}, callbackUrl } };
}

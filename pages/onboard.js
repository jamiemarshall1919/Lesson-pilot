// pages/onboard.js
import { useSession, signIn } from "next-auth/react";
import { useState }           from "react";
import { useRouter }          from "next/router";
import styles                 from "./onboard.module.css";

export default function Onboard() {
  const { data: session } = useSession();
  const [region, setRegion] = useState("");
  const router = useRouter();

  // If they somehow hit this page without being signed in…
  if (!session) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <p>Please sign in first:</p>
          <button className={styles.button} onClick={() => signIn()}>
            Sign in
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async () => {
    await fetch("/api/set-region", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ region }),
    });
    router.push("/");
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Welcome, {session.user.email}</h1>
        <p className={styles.subtitle}>Select your teaching region:</p>
        <select
          className={styles.select}
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        >
          <option value="">— Choose region —</option>
          <option value="nys">New York State</option>
          <option value="england">England (KS1–4)</option>
          <option value="common_core">Common Core</option>
          <option value="none">None / General</option>
        </select>
        <button
          className={styles.button}
          onClick={handleSubmit}
          disabled={!region}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

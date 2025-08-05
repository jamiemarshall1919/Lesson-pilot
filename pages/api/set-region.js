// pages/api/set-region.js
import { serialize } from "cookie";

export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { region } = req.body;
  // Set a cookie named "region" for one year
  res.setHeader(
    "Set-Cookie",
    serialize("region", region, {
      path: "/",
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 365,
    })
  );
  res.status(200).json({ ok: true });
}

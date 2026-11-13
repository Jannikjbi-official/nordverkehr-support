import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://discord.com" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.discordapp.com" }],
  },
  serverExternalPackages: ["sharp", "@discordjs/rest"],
  // Kleinere Server-Funktionen (weniger Speicher pro Deployment auf Vercel):
  // Prisma bringt Engines für alle Datenbanken/Laufzeiten mit, sharp Varianten
  // für andere Systeme – gebraucht wird nur die native Postgres-Engine (Linux, glibc).
  outputFileTracingExcludes: {
    "*": [
      "node_modules/@prisma/client/runtime/*.wasm*",
      "node_modules/@prisma/client/runtime/query_engine_bg.*",
      "node_modules/@prisma/client/runtime/query_compiler_bg.*",
      "node_modules/@prisma/client/runtime/binary.*",
      "node_modules/@prisma/client/runtime/edge*",
      "node_modules/@prisma/client/runtime/wasm*",
      "node_modules/@prisma/client/runtime/react-native*",
      "node_modules/.prisma/client/*.wasm",
      "node_modules/.prisma/client/edge*",
      "node_modules/.prisma/client/wasm*",
      "node_modules/@img/sharp-libvips-linuxmusl-*/**",
      "node_modules/@img/sharp-linuxmusl-*/**",
      "node_modules/@img/sharp-wasm32/**",
      "node_modules/@img/sharp-darwin-*/**",
      "node_modules/@img/sharp-win32-*/**",
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    return [
      { source: "/impressum", destination: `${process.env.NEXT_PUBLIC_MAIN_SITE_URL ?? "https://nordverkehr.xyz"}/impressum`, permanent: false },
      { source: "/ticket", destination: "/tickets/neu", permanent: false },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/hilfe/", "/status", "/datenschutz"], disallow: ["/team", "/dashboard", "/tickets", "/antraege", "/konto", "/suche", "/api"] }],
  };
}

import type { MetadataRoute } from "next";

/** Sistema interno: los buscadores no lo indexan, pero sí se puede leer la portada (vista previa del link) */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: ["/$", "/login"], disallow: "/" } };
}

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    remotePatterns: [
      {
        hostname: "avatar.vercel.sh",
      },
      {
        protocol: "https",
        //https://nextjs.org/docs/messages/next-image-unconfigured-host
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
  // Transpile Syncfusion packages for proper module resolution
  transpilePackages: [
    "@syncfusion/ej2-react-documenteditor",
    "@syncfusion/ej2-base",
    "@syncfusion/ej2-documenteditor",
    "@syncfusion/ej2-buttons",
    "@syncfusion/ej2-inputs",
    "@syncfusion/ej2-popups",
    "@syncfusion/ej2-lists",
    "@syncfusion/ej2-navigations",
    "@syncfusion/ej2-splitbuttons",
    "@syncfusion/ej2-dropdowns",
  ],
};

export default nextConfig;

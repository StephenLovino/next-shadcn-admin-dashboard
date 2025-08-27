import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "AHA Rewards",
  version: packageJson.version,
  copyright: `© ${currentYear}, AHA Rewards.`,
  meta: {
    title: "AHA Rewards - Modern Next.js Dashboard Starter Template",
    description:
      "AHA Rewards is a modern, open-source dashboard starter template built with Next.js 15, Tailwind CSS v4, and shadcn/ui. Perfect for SaaS apps, admin panels, and internal tools—fully customizable and production-ready.",
  },
};

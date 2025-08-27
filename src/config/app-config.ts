import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "AHA Rewards",
  version: packageJson.version,
  copyright: `© ${currentYear}, AHA Rewards.`,
  meta: {
    title: "AHA Rewards - Rewards Management Platform",
    description:
      "AHA Rewards is a comprehensive rewards management platform built with modern web technologies. Manage rewards, track points, and engage your community with our intuitive dashboard.",
  },
};

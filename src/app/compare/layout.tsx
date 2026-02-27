import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compare Agents | Hyphae Store",
  description:
    "Compare multiple AI agents side-by-side to find the best fit for your needs.",
};

export default function CompareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

import { createFileRoute } from "@tanstack/react-router";
import { LifeApp } from "@/components/life/life-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <LifeApp />;
}

import { createFileRoute } from "@tanstack/react-router";
import { SumiBird } from "@/components/sumi-bird";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <SumiBird />;
}

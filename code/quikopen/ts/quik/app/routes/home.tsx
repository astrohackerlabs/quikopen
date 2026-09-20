import type { Route } from "./+types/home";
import { ViewerPage } from "~/components/viewer-page";

export function meta(): ReturnType<Route.MetaFunction> {
  return [
    { title: "Quikopen" },
    {
      name: "description",
      content: "Open SVG files in Astrohacker TermSurf.",
    },
  ];
}

export default function Home(): React.JSX.Element {
  return <ViewerPage />;
}

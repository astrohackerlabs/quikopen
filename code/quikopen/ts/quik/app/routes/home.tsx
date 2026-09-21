import type { Route } from "./+types/home";
import { ViewerPage } from "~/components/viewer-page";

export function meta(): ReturnType<Route.MetaFunction> {
  return [
    { title: "QuikOpen — Image Viewer" },
    {
      name: "description",
      content:
        "Open SVG, JPEG, PNG, GIF and WebP images in Astrohacker TermSurf.",
    },
  ];
}

export default function Home(): React.JSX.Element {
  return <ViewerPage />;
}

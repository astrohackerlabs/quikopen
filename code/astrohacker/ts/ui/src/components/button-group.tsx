import * as React from "react";

import { cn } from "../utils";

function ButtonGroup({
  className,
  ...props
}: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="button-group"
      role="group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  );
}

export { ButtonGroup };

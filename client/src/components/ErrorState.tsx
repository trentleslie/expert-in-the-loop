import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

interface ErrorStateProps {
  title?: string;
  description?: string;
  retry?: {
    label?: string;
    onClick: () => void;
    testId?: string;
  };
  fullPage?: boolean;
  testId?: string;
}

export function ErrorState({
  title = "Something went wrong",
  description = "An unexpected error occurred. Please try again.",
  retry,
  fullPage = false,
  testId,
}: ErrorStateProps) {
  const content = (
    <Card className="max-w-md w-full border-card-border" data-testid={testId}>
      <CardContent className="flex flex-col items-center py-12">
        <AlertCircle className="w-12 h-12 text-destructive mb-4" aria-hidden="true" />
        <h2 className="text-lg font-medium text-foreground mb-2 text-center">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-4">
          {description}
        </p>
        {retry && (
          <Button onClick={retry.onClick} data-testid={retry.testId}>
            {retry.label ?? "Try Again"}
          </Button>
        )}
      </CardContent>
    </Card>
  );

  if (fullPage) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        {content}
      </div>
    );
  }

  return content;
}

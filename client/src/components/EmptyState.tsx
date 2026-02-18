import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    testId?: string;
  };
  testId?: string;
}

export function EmptyState({ icon, title, description, action, testId }: EmptyStateProps) {
  return (
    <Card className="border-card-border" data-testid={testId}>
      <CardContent className="flex flex-col items-center justify-center py-12">
        {icon && (
          <div className="p-3 rounded-full bg-muted mb-4">
            {icon}
          </div>
        )}
        <h3 className="text-base font-medium text-foreground mb-1">
          {title}
        </h3>
        {description && (
          <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
            {description}
          </p>
        )}
        {action && (
          <Button onClick={action.onClick} data-testid={action.testId}>
            {action.label}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

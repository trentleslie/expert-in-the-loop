import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type LoadingCardVariant = "compact" | "default" | "large";

interface LoadingCardProps {
  variant?: LoadingCardVariant;
  height?: string;
  className?: string;
}

const variantHeights: Record<LoadingCardVariant, string> = {
  compact: "h-16",
  default: "h-32",
  large: "h-64",
};

export function LoadingCard({ variant = "default", height, className }: LoadingCardProps) {
  const resolvedHeight = height ?? variantHeights[variant];

  return (
    <Skeleton className={`${resolvedHeight} ${className ?? ""}`} />
  );
}

interface LoadingCardListProps {
  count?: number;
  variant?: LoadingCardVariant;
  className?: string;
}

export function LoadingCardList({ count = 3, variant = "default", className }: LoadingCardListProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <LoadingCard key={i} variant={variant} className={className} />
      ))}
    </>
  );
}

interface LoadingDetailCardProps {
  rows?: number;
}

export function LoadingDetailCard({ rows = 3 }: LoadingDetailCardProps) {
  return (
    <Card className="border-card-border">
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full mt-2" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

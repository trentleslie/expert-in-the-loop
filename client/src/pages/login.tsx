import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Database, CheckCircle, ArrowRight, Shield } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    if (errorParam) {
      if (errorParam === "domain_not_allowed") {
        setError("Your email domain is not authorized to access this application. Please contact an administrator.");
      } else if (errorParam === "auth_failed") {
        setError("Authentication failed. Please try again.");
      } else {
        setError("An error occurred during sign in. Please try again.");
      }
    }
  }, []);

  const handleGoogleLogin = () => {
    window.location.href = "/api/auth/google";
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Database className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground mb-2">
            Expert in the Loop
          </h1>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Human expert validation for AI-generated outputs
          </p>
          <p className="text-muted-foreground text-xs max-w-sm mx-auto mt-2">
            Build gold standard datasets through structured expert review of LLM matches, classifications, and recommendations.
          </p>
        </div>

        <Card className="border-card-border">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-lg font-medium">Sign In</CardTitle>
            <CardDescription>
              Use your organization Google account to continue
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button 
              onClick={handleGoogleLogin}
              className="w-full h-11 gap-3"
              data-testid="button-google-login"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Sign in with Google
            </Button>

            <div className="pt-4 border-t border-border">
              <div className="flex items-start gap-3 text-sm text-muted-foreground">
                <Shield className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p>
                  Access is restricted to authorized organization domains. 
                  Contact your administrator if you need access.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 space-y-4">
          <h2 className="text-sm font-medium text-foreground text-center">What you'll do</h2>
          <div className="grid gap-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-card border border-card-border">
              <CheckCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Review AI Outputs</p>
                <p className="text-xs text-muted-foreground">
                  Validate LLM-suggested matches, classifications, and recommendations
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-card border border-card-border">
              <CheckCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Build Gold Standards</p>
                <p className="text-xs text-muted-foreground">
                  Your feedback helps evaluate and improve AI systems
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-card border border-card-border">
              <ArrowRight className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Efficient Review Workflow</p>
                <p className="text-xs text-muted-foreground">
                  Keyboard shortcuts and structured scoring for rapid expert validation
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

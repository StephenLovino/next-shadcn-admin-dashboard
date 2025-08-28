"use client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { SimpleIcon } from "@/components/simple-icon";
import { siGoogle } from "simple-icons";
import { cn } from "@/lib/utils";

export function GoogleButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  const [isLoading, setIsLoading] = useState(false);

  // Check for hash-based tokens on component mount
  useEffect(() => {
    const handleHashTokens = async () => {
      if (typeof window === "undefined") return;

      const hash = window.location.hash;
      if (hash && hash.includes("access_token")) {
        console.log("🔍 Found hash tokens, processing...");

        // Parse the hash parameters
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");

        if (accessToken && refreshToken) {
          console.log("✅ Hash tokens found, setting session...");
          try {
            // Set the session manually
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              console.error("❌ Error setting session:", error);
              toast.error("Failed to complete sign-in", { description: error.message });
            } else if (data.session) {
              console.log("✅ Session set successfully!");
              toast.success("Sign-in successful!");
              // Redirect to dashboard
              window.location.href = "/dashboard/default";
            }
          } catch (error) {
            console.error("❌ Error processing hash tokens:", error);
            toast.error("Failed to complete sign-in");
          }
        }
      }
    };

    handleHashTokens();
  }, []);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      console.log("🚀 Starting Google OAuth...");
      console.log("Current origin:", window.location.origin);
      console.log("Redirect URL:", `${window.location.origin}/auth/v2/login`);
      console.log("Supabase URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/v2/login`,
          queryParams: {
            prompt: "select_account", // Force account picker every time
            access_type: "offline", // Get refresh token
          },
        },
      });

      console.log("📡 Supabase OAuth response:", { data, error });

      if (error) {
        console.error("❌ Google OAuth error:", error);
        toast.error("Google sign-in failed", {
          description: error.message,
        });
      } else {
        console.log("✅ Google OAuth initiated successfully:", data);
        console.log("OAuth URL:", data.url);
        console.log("Provider:", data.provider);

        if (data.url) {
          console.log("🔄 Redirecting to:", data.url);
          toast.success("Redirecting to Google...");
          // Force the redirect
          window.location.href = data.url;
        } else {
          console.error("❌ No OAuth URL received");
          toast.error("OAuth failed - no redirect URL");
        }
      }
    } catch (error) {
      console.error("❌ Google sign-in error:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant="default"
      className={cn(
        "w-full border-2 border-gray-200 bg-white font-medium text-gray-900 shadow-sm transition-all duration-200 hover:border-gray-300 hover:bg-gray-50 hover:shadow-md",
        "focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
        className,
      )}
      onClick={handleGoogleSignIn}
      disabled={isLoading}
      {...props}
    >
      <SimpleIcon icon={siGoogle} className="mr-3 size-5" />
      {isLoading ? "Signing in..." : "Continue with Google"}
    </Button>
  );
}

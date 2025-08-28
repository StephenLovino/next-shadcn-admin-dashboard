"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { LoginForm } from "../../_components/login-form";
import { RegisterForm } from "../../_components/register-form";
import { GoogleButton } from "../../_components/social-auth/google-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  // Process OAuth tokens in the background
  useEffect(() => {
    const handleHashTokens = async () => {
      if (typeof window === "undefined") return;

      const hash = window.location.hash;
      if (hash && hash.includes("access_token")) {
        console.log("🔍 Processing OAuth tokens...");
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");

        if (accessToken && refreshToken) {
          try {
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              console.error("❌ OAuth error:", error);
              toast.error("Sign-in failed: " + error.message);
            } else if (data.session) {
              console.log("✅ OAuth successful!");
              toast.success("Welcome back!");
              // Clear the hash from URL
              window.history.replaceState({}, document.title, window.location.pathname);
              // Redirect will happen automatically via auth context
            }
          } catch (error) {
            console.error("❌ OAuth exception:", error);
            toast.error("Sign-in failed");
          }
        }
      }
    };

    handleHashTokens();
  }, []);

  // Redirect to dashboard if already signed in
  useEffect(() => {
    if (!loading && user) {
      console.log("✅ User already signed in, redirecting to dashboard");
      router.push("/dashboard/default");
    }
  }, [user, loading, router]);

  // If user is signed in, don't render the form (will redirect)
  if (user) {
    return null;
  }

  return (
    <div className="relative container grid min-h-screen flex-col items-center justify-center lg:max-w-none lg:grid-cols-1 lg:px-0">
      <div className="flex justify-center lg:p-8">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[400px]">
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Welcome to AHA Rewards</h1>
            <p className="text-muted-foreground text-sm">Sign in to your account to continue</p>
          </div>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="space-y-4">
              <div className="space-y-4">
                <GoogleButton className="w-full" />
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background text-muted-foreground px-2">Or continue with</span>
                  </div>
                </div>
                <LoginForm />
              </div>
            </TabsContent>
            <TabsContent value="register" className="space-y-4">
              <div className="space-y-4">
                <GoogleButton className="w-full" />
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background text-muted-foreground px-2">Or continue with</span>
                  </div>
                </div>
                <RegisterForm />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

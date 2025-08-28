"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";

interface DashboardAuthWrapperProps {
  children: ReactNode;
}

export function DashboardAuthWrapper({ children }: DashboardAuthWrapperProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      console.log("❌ No user in dashboard, redirecting to login");
      router.push("/auth/v2/login");
    }
  }, [user, loading, router]);

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2"></div>
      </div>
    );
  }

  // Don't render dashboard if no user
  if (!user) {
    return null;
  }

  // Render dashboard if user is authenticated
  return <>{children}</>;
}

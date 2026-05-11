/**
 * RequireAuth.tsx — Route guard component that redirects unauthenticated users to /login and shows a loading spinner until the Firebase Auth state is resolved.
 */
import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { useAuth } from "./AuthContext";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

/**
 * LoginPage.tsx — Google sign-in page backed by Firebase Auth; redirects already-authenticated users to the home page and shows a loading state while sign-in is in progress.
 */
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  CircularProgress,
  Paper,
  Typography,
} from "@mui/material";
import { FirebaseError } from "firebase/app";
import { useAuth } from "./AuthContext";

const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  "auth/popup-blocked": "Popup was blocked by your browser. Please allow popups for this site.",
  "auth/popup-closed-by-user": "Sign-in was cancelled.",
  "auth/network-request-failed": "Network error. Please check your connection.",
  "auth/cancelled-popup-request": "Sign-in was cancelled.",
};

export default function LoginPage() {
  const { user, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof FirebaseError) {
        setError(FIREBASE_ERROR_MESSAGES[err.code] ?? "Sign-in failed. Please try again.");
      } else {
        setError("Sign-in failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: { xs: 4, sm: 6 },
          borderRadius: 4,
          maxWidth: 400,
          width: "100%",
          mx: 2,
          border: "1px solid rgba(0,0,0,0.07)",
          boxShadow: "0 4px 32px rgba(0,0,0,0.06)",
          textAlign: "center",
        }}
      >
        <Box
          component="img"
          src="/logozoom.jpg"
          alt="Structuralized Logo"
          sx={{
            width: 72,
            height: "auto",
            mb: 3,
            borderRadius: 3,
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          }}
        />

        <Typography
          sx={{ fontWeight: 800, fontSize: "1.75rem", color: "#0f172a", mb: 1 }}
        >
          Structuralized
        </Typography>

        <Typography
          variant="body2"
          sx={{ color: "#64748b", mb: 4, lineHeight: 1.6 }}
        >
          Sign in to start building your structured work sessions.
        </Typography>

        <Button
          fullWidth
          variant="outlined"
          size="large"
          onClick={handleSignIn}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={18} /> : <GoogleIcon />}
          sx={{
            borderRadius: 3,
            textTransform: "none",
            fontWeight: 600,
            fontSize: "0.95rem",
            py: 1.5,
            borderColor: "rgba(0,0,0,0.2)",
            color: "#0f172a",
            "&:hover": {
              borderColor: "rgba(0,0,0,0.35)",
              bgcolor: "rgba(0,0,0,0.02)",
            },
          }}
        >
          Continue with Google
        </Button>

        {error && (
          <Typography
            variant="caption"
            sx={{ display: "block", mt: 2, color: "error.main" }}
          >
            {error}
          </Typography>
        )}
      </Paper>
    </Box>
  );
}

function GoogleIcon() {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      sx={{ width: 20, height: 20, flexShrink: 0 }}
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </Box>
  );
}

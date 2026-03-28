import { useNavigate } from "react-router-dom";
import {
  Avatar,
  Box,
  Container,
  IconButton,
  Tooltip,
  Typography,
  Button,
  Stack,
  Divider,
} from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import MonitorHeartIcon from "@mui/icons-material/MonitorHeart";
import BarChartIcon from "@mui/icons-material/BarChart";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import LogoutIcon from "@mui/icons-material/Logout";
import HistoryIcon from "@mui/icons-material/History";
import { Link as RouterLink } from "react-router-dom";
import { useAuth } from "./AuthContext";

interface Feature {
  icon: React.ReactNode;
  title: string;
  accentColor: string;
  bullets: string[];
}

const FEATURES: Feature[] = [
  {
    icon: <AutoFixHighIcon />,
    title: "Automatic Self‑Guidance:",
    accentColor: "#3b82f6",
    bullets: [
      "Actively enforce time management based on self‑imposed constraints and rules set by the user at the beginning of the session.",
      "Actively guide you through your planned schedule—ensuring that you're executing the specific work and actions you are actually supposed to do according to your plan.",
    ],
  },
  {
    icon: <MonitorHeartIcon />,
    title: "Automatic Self‑Regulation & Monitoring:",
    accentColor: "#8b5cf6",
    bullets: [
      "Enforces time boundaries and structured transitions – using smart interventions.",
      "Ensure you follow through with your pre‑planned work schedule, keeping you on track with the topics and timeframes you initially defined for yourself.",
    ],
  },
  {
    icon: <BarChartIcon />,
    title: "Detailed Session Reports:",
    accentColor: "#10b981",
    bullets: [
      "Tracks your actual workflow throughout the day and compiles a session report, highlighting differences between your planned structure and what actually occurred.",
      "Allows you to analyze behavior patterns, identify inefficiencies, and optimize future work sessions based on real‑time feedback and past performance.",
    ],
  },
];

const CTA_SX = {
  px: 5,
  py: 1.75,
  borderRadius: 100,
  fontSize: "1rem",
  fontWeight: 600,
  textTransform: "none",
  bgcolor: "#0f172a",
  boxShadow: "0 4px 14px rgba(15,23,42,0.2)",
  "&:hover": {
    bgcolor: "#1e293b",
    transform: "translateY(-1px)",
    boxShadow: "0 8px 24px rgba(15,23,42,0.25)",
  },
  transition: "all 0.2s ease",
} as const;

export default function HomePage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const handleGetStarted = () => navigate("/app");

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)",
        position: "relative",
      }}
    >
      {/* ── User avatar + logout ── */}
      <Box
        sx={{
          position: "absolute",
          top: 16,
          right: 16,
          display: "flex",
          alignItems: "center",
          gap: 1,
          zIndex: 10,
        }}
      >
        {user?.photoURL && (
          <Avatar
            src={user.photoURL}
            alt={user.displayName ?? "User"}
            sx={{ width: 34, height: 34 }}
          />
        )}
        <Tooltip title="Session Archive">
          <IconButton
            size="small"
            component={RouterLink}
            to="/archive"
            sx={{ color: "#64748b" }}
          >
            <HistoryIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Sign out">
          <IconButton size="small" onClick={signOut} sx={{ color: "#64748b" }}>
            <LogoutIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      {/* ── Hero ── */}
      <Box
        sx={{
          pt: { xs: 8, md: 14 },
          pb: { xs: 6, md: 10 },
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Decorative radial accents */}
        <Box
          sx={{
            position: "absolute",
            top: -120,
            right: -120,
            width: 480,
            height: 480,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <Box
          sx={{
            position: "absolute",
            bottom: -100,
            left: -100,
            width: 360,
            height: 360,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <Container maxWidth="md" sx={{ position: "relative" }}>
          <Box
            component="img"
            src="/logozoom.jpg"
            alt="Structuralized Logo"
            sx={{
              width: { xs: 72, md: 96 },
              height: "auto",
              mb: 3,
              borderRadius: 3,
              boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            }}
          />

          <Typography
            component="h1"
            sx={{
              fontWeight: 800,
              fontSize: { xs: "2.5rem", md: "3.75rem" },
              letterSpacing: "-0.03em",
              color: "#0f172a",
              lineHeight: 1.08,
              mb: 2.5,
            }}
          >
            Structuralized
          </Typography>

          <Typography
            sx={{
              fontWeight: 400,
              color: "#64748b",
              fontSize: { xs: "1rem", md: "1.2rem" },
              maxWidth: 560,
              mx: "auto",
              lineHeight: 1.65,
            }}
          >
            A System for Creating a Structured Work Environment with Active
            Guidance, Monitoring, and Self‑Regulation in Real‑Time
          </Typography>

          <Button
            variant="contained"
            size="large"
            endIcon={<ArrowForwardIcon />}
            onClick={handleGetStarted}
            sx={{ ...CTA_SX, mt: 5 }}
          >
            Get Started
          </Button>
        </Container>
      </Box>

      {/* ── Divider ── */}
      <Container maxWidth="lg">
        <Divider sx={{ borderColor: "rgba(0,0,0,0.07)" }} />
      </Container>

      {/* ── Features ── */}
      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        <Stack spacing={3}>
          {FEATURES.map((feature) => (
            <Box
              key={feature.title}
              sx={{
                display: "flex",
                gap: { xs: 2, md: 3 },
                p: { xs: 3, md: 4 },
                borderRadius: 4,
                bgcolor: "#ffffff",
                borderLeft: `4px solid ${feature.accentColor}`,
                boxShadow:
                  "0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)",
                transition: "box-shadow 0.2s ease, transform 0.2s ease",
                "&:hover": {
                  boxShadow: "0 4px 24px rgba(0,0,0,0.09)",
                  transform: "translateY(-1px)",
                },
              }}
            >
              {/* Icon badge */}
              <Box
                sx={{
                  flexShrink: 0,
                  width: 44,
                  height: 44,
                  borderRadius: 2.5,
                  bgcolor: `${feature.accentColor}18`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: feature.accentColor,
                }}
              >
                {feature.icon}
              </Box>

              {/* Content */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  component="h2"
                  sx={{
                    fontWeight: 700,
                    fontSize: { xs: "1rem", md: "1.1rem" },
                    color: "#0f172a",
                    mb: 1.5,
                  }}
                >
                  {feature.title}
                </Typography>
                <Box component="ul" sx={{ pl: 2.5, m: 0 }}>
                  {feature.bullets.map((bullet, i) => (
                    <Typography
                      key={i}
                      component="li"
                      variant="body2"
                      sx={{
                        color: "#475569",
                        lineHeight: 1.75,
                        mb: i < feature.bullets.length - 1 ? 1 : 0,
                        wordBreak: "break-word",
                      }}
                    >
                      {bullet}
                    </Typography>
                  ))}
                </Box>
              </Box>
            </Box>
          ))}
        </Stack>

        {/* ── Bottom CTA ── */}
        <Box sx={{ textAlign: "center", mt: { xs: 6, md: 10 } }}>
          <Typography
            variant="body2"
            sx={{ color: "#94a3b8", mb: 2.5, fontWeight: 500 }}
          >
            Ready to take control of your self-directed work?
          </Typography>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            justifyContent="center"
            alignItems="center"
          >
            <Button
              variant="contained"
              size="large"
              endIcon={<ArrowForwardIcon />}
              onClick={handleGetStarted}
              sx={CTA_SX}
            >
              Start Building Your Session
            </Button>
            <Button
              component={RouterLink}
              to="/archive"
              variant="outlined"
              size="large"
              startIcon={<HistoryIcon />}
              sx={{
                px: 5,
                py: 1.75,
                borderRadius: 100,
                fontSize: "1rem",
                fontWeight: 600,
                textTransform: "none",
                color: "#0f172a",
                borderColor: "#0f172a",
                "&:hover": {
                  borderColor: "#0f172a",
                  bgcolor: "rgba(15,23,42,0.05)",
                  transform: "translateY(-1px)",
                },
                transition: "all 0.2s ease",
              }}
            >
              View Archive
            </Button>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
}

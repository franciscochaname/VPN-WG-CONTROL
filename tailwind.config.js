/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}", "./electron/**/*.{js,cjs}"],
  theme: {
    extend: {
      colors: {
        warm: {
          canvas: "#fbf7ef",
          panel: "#fffdf8",
          line: "#eadfce",
          ink: "#2a2520",
          muted: "#73695f",
          amber: "#e5a23a",
          copper: "#c66a38",
          mint: "#4d9078",
          sky: "#4b8fab"
        }
      },
      boxShadow: {
        soft: "0 18px 45px rgba(76, 54, 32, 0.12)"
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"]
      },
      keyframes: {
        flow: {
          "0%": { strokeDashoffset: "80" },
          "100%": { strokeDashoffset: "0" }
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" }
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.55", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.05)" }
        }
      },
      animation: {
        flow: "flow 1.8s linear infinite",
        float: "float 5s ease-in-out infinite",
        pulseSoft: "pulseSoft 2.6s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

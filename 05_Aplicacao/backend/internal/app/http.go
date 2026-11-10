package app

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"legisanalytica/internal/activity"
	"legisanalytica/internal/expense"
	"legisanalytica/internal/graphql"
	"legisanalytica/internal/politician"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func connectPostgres() (*gorm.DB, error) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		return nil, fmt.Errorf("DATABASE_URL environment variable is not set")
	}
	return gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.New(log.New(os.Stdout, "\n", log.LstdFlags), logger.Config{
			SlowThreshold: 2 * time.Minute,
			LogLevel:      logger.Warn,
		}),
	})
}

// NewHTTPHandler initializes the GraphQL handler and its HTTP routes.
func NewHTTPHandler() (http.Handler, error) {
	if err := godotenv.Load(); err != nil {
		log.Printf("Aviso: Erro ao carregar arquivo .env: %v", err)
	}
	db, err := connectPostgres()
	if err != nil {
		return nil, err
	}

	pRepo := politician.NewRepository(db)
	dRepo := expense.NewRepository(db)
	aRepo := activity.NewRepository(db)
	gqlHandler := graphql.NewGraphQLHandler(
		politician.NewService(pRepo),
		expense.NewService(dRepo),
		activity.NewService(aRepo),
	)
	if gqlHandler == nil {
		return nil, fmt.Errorf("could not initialize GraphQL handler")
	}

	mux := http.NewServeMux()
	mux.Handle("/graphql", withCORS(os.Getenv("CORS_ALLOWED_ORIGIN"), http.HandlerFunc(gqlHandler.HandleGraphQL)))
	return mux, nil
}

func withCORS(allowedOrigin string, next http.Handler) http.Handler {
	allowedOrigin = strings.TrimSpace(allowedOrigin)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Add("Vary", "Origin")
		origin := r.Header.Get("Origin")
		if origin == "" {
			next.ServeHTTP(w, r)
			return
		}
		if allowedOrigin == "" || allowedOrigin == "*" || origin != allowedOrigin {
			http.Error(w, "Origin not allowed", http.StatusForbidden)
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
		if r.Method == http.MethodOptions {
			w.Header().Add("Vary", "Access-Control-Request-Method")
			w.Header().Add("Vary", "Access-Control-Request-Headers")
			if r.Header.Get("Access-Control-Request-Method") != http.MethodPost {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
				return
			}
			for _, header := range strings.Split(r.Header.Get("Access-Control-Request-Headers"), ",") {
				if header = strings.TrimSpace(header); header != "" && !strings.EqualFold(header, "Content-Type") {
					http.Error(w, "Header not allowed", http.StatusForbidden)
					return
				}
			}
			w.Header().Set("Access-Control-Allow-Methods", "POST")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

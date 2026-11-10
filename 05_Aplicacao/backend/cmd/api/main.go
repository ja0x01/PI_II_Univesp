package main

import (
	"fmt"
	"log"
	"net/http"
	"time"

	"legisanalytica/app"
)

const serverPort = ":8080"

func main() {
	handler, err := app.NewHTTPHandler()
	if err != nil {
		log.Fatalf("Erro ao inicializar API: %v", err)
	}

	srv := &http.Server{
		Addr:              serverPort,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      70 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 16,
	}

	fmt.Printf("Server running on %s (HTTP)\n", serverPort)
	log.Fatal(srv.ListenAndServe())
}

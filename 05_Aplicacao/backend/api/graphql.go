package handler

import (
	"log"
	"net/http"
	"sync"

	"legisanalytica/app"
)

var (
	initOnce       sync.Once
	runtimeHandler http.Handler
	initErr        error
)

func Handler(w http.ResponseWriter, r *http.Request) {
	initOnce.Do(func() {
		runtimeHandler, initErr = app.NewHTTPHandler()
	})
	if initErr != nil {
		log.Printf("Erro ao inicializar API: %v", initErr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	runtimeHandler.ServeHTTP(w, r)
}

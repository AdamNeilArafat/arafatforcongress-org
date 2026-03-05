NOMINATIM_COMPOSE=docker compose -f infra/nominatim/docker-compose.yml

.PHONY: nominatim-up nominatim-import nominatim-down nominatim-logs

nominatim-up:
	$(NOMINATIM_COMPOSE) up -d

nominatim-import:
	$(NOMINATIM_COMPOSE) down
	$(NOMINATIM_COMPOSE) up -d --force-recreate nominatim

nominatim-down:
	$(NOMINATIM_COMPOSE) down

nominatim-logs:
	$(NOMINATIM_COMPOSE) logs -f nominatim

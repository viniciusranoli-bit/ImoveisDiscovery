import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isEvolutionConfigured,
  resolveEvolutionBaseUrl,
} from "../src/lib/alerts/evolution-whatsapp";

test("isEvolutionConfigured exige URL, chave e instância", () => {
  const previous = {
    url: process.env.EVOLUTION_API_URL,
    key: process.env.EVOLUTION_API_KEY,
    instance: process.env.EVOLUTION_INSTANCE_NAME,
  };
  delete process.env.EVOLUTION_API_URL;
  delete process.env.EVOLUTION_API_KEY;
  delete process.env.EVOLUTION_INSTANCE_NAME;
  assert.equal(isEvolutionConfigured(), false);
  process.env.EVOLUTION_API_URL = "http://127.0.0.1:8080";
  process.env.EVOLUTION_API_KEY = "test-key";
  process.env.EVOLUTION_INSTANCE_NAME = "radar";
  assert.equal(isEvolutionConfigured(), true);
  if (previous.url) process.env.EVOLUTION_API_URL = previous.url;
  else delete process.env.EVOLUTION_API_URL;
  if (previous.key) process.env.EVOLUTION_API_KEY = previous.key;
  else delete process.env.EVOLUTION_API_KEY;
  if (previous.instance) process.env.EVOLUTION_INSTANCE_NAME = previous.instance;
  else delete process.env.EVOLUTION_INSTANCE_NAME;
});

test("resolveEvolutionBaseUrl reescreve localhost quando BACKEND_IN_DOCKER=true", () => {
  const previous = process.env.BACKEND_IN_DOCKER;
  process.env.BACKEND_IN_DOCKER = "true";
  assert.equal(
    resolveEvolutionBaseUrl("http://127.0.0.1:8080"),
    "http://host.docker.internal:8080",
  );
  assert.equal(
    resolveEvolutionBaseUrl("http://localhost:8080"),
    "http://host.docker.internal:8080",
  );
  if (previous === undefined) delete process.env.BACKEND_IN_DOCKER;
  else process.env.BACKEND_IN_DOCKER = previous;
});

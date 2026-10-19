import assert from "node:assert/strict";
import test from "node:test";
import {
  collectRequestSchema,
  loginRequestSchema,
} from "@aluguel/shared/contracts";

test("contrato de login exige e-mail e senha válidos", () => {
  assert.equal(
    loginRequestSchema.safeParse({
      email: "vinicius@example.com",
      password: "senha-segura",
    }).success,
    true,
  );
  assert.equal(loginRequestSchema.safeParse({ email: "inválido", password: "123" }).success, false);
});

test("contrato de coleta não aceita filtro de imóvel incompleto", () => {
  assert.equal(
    collectRequestSchema.safeParse({
      city: "Rio de Janeiro",
      neighborhoods: ["Botafogo"],
      filters: {
        purpose: "sale",
        bedroomsMin: 2,
        parkingMin: 1,
        propertyTypes: ["apartment"],
      },
    }).success,
    true,
  );
  assert.equal(
    collectRequestSchema.safeParse({
      city: "Rio de Janeiro",
      neighborhoods: [],
      filters: {},
    }).success,
    false,
  );
});

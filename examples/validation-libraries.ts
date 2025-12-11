// Example: Using @validate with different schema libraries
import { RpcTarget, validate } from "../src/index.js";
import { z } from "zod";
import * as v from "valibot";
import { type } from "arktype";
import * as yup from "yup";

// =============================================================================
// Zod
// =============================================================================

export class ZodApi extends RpcTarget {
  @validate([z.string().min(1), z.number().positive()])
  async greet(name: string, age: number) {
    return `Hello ${name}, you are ${age} years old`;
  }

  @validate([z.string().email()])
  async sendEmail(to: string) {
    return `Email sent to ${to}`;
  }

  @validate([z.array(z.number()).min(1)])
  async sum(numbers: number[]) {
    return numbers.reduce((a, b) => a + b, 0);
  }
}

// =============================================================================
// Valibot
// =============================================================================

export class ValibotApi extends RpcTarget {
  @validate([v.pipe(v.string(), v.minLength(1)), v.pipe(v.number(), v.minValue(1))])
  async greet(name: string, age: number) {
    return `Hello ${name}, you are ${age} years old`;
  }

  @validate([v.pipe(v.string(), v.email())])
  async sendEmail(to: string) {
    return `Email sent to ${to}`;
  }

  @validate([v.pipe(v.array(v.number()), v.minLength(1))])
  async sum(numbers: number[]) {
    return numbers.reduce((a, b) => a + b, 0);
  }
}

// =============================================================================
// ArkType
// =============================================================================

export class ArkTypeApi extends RpcTarget {
  @validate([type("string > 0"), type("number > 0")])
  async greet(name: string, age: number) {
    return `Hello ${name}, you are ${age} years old`;
  }

  @validate([type("string.email")])
  async sendEmail(to: string) {
    return `Email sent to ${to}`;
  }

  @validate([type("number[] > 0")])
  async sum(numbers: number[]) {
    return numbers.reduce((a, b) => a + b, 0);
  }
}

// =============================================================================
// Yup
// =============================================================================

export class YupApi extends RpcTarget {
  @validate([yup.string().required().min(1), yup.number().required().positive()])
  async greet(name: string, age: number) {
    return `Hello ${name}, you are ${age} years old`;
  }

  @validate([yup.string().required().email()])
  async sendEmail(to: string) {
    return `Email sent to ${to}`;
  }

  @validate([yup.array().of(yup.number().required()).min(1).required()])
  async sum(numbers: number[]) {
    return numbers.reduce((a, b) => a + b, 0);
  }
}

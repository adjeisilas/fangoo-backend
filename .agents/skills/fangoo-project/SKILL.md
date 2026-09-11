---

name: fangoo-project

description: Project-wide development skill for Fangoo, a fuel marketplace and delivery platform connecting customers with fuel suppliers. Use when developing, reviewing, debugging, refactoring, designing, testing, or extending any part of the Fangoo application. Applies to backend, frontend, database, API, authentication, orders, payments, suppliers, customers, administration, architecture, security, and project structure.

license: MIT

metadata:
author: fangoo
version: "1.0.0"

---

# Fangoo Project

Project-wide development skill that defines Fangoo's architecture, technology stack, business rules, coding standards, security requirements, development principles, and implementation workflow.

This skill is the primary project context for Fangoo development.

When this skill applies, follow its rules unless the user explicitly overrides a rule.

---

## When to Apply

Use this skill whenever working on the Fangoo project, including:

* Building new Fangoo features
* Modifying existing Fangoo features
* Reviewing Fangoo code
* Debugging Fangoo
* Refactoring Fangoo
* Designing APIs
* Designing database models
* Working with Prisma
* Working with PostgreSQL
* Building NestJS modules
* Building Nuxt pages or components
* Implementing authentication
* Implementing authorization and roles
* Implementing supplier functionality
* Implementing customer functionality
* Implementing orders
* Implementing payments
* Implementing delivery tracking
* Implementing reviews
* Implementing administration features
* Writing tests
* Reviewing security
* Reviewing architecture
* Connecting frontend and backend
* Improving performance
* Fixing bugs
* Adding dependencies
* Changing project structure
* Preparing the project for deployment

Do not treat Fangoo as a generic NestJS, Nuxt, Prisma, or PostgreSQL project.

The Fangoo-specific architecture and business rules in this skill take priority over generic implementation patterns when they conflict.

---

# 1. Project Overview

## 1.1 What Fangoo Is

Fangoo is a fuel marketplace and delivery platform.

The platform connects customers who need fuel with verified fuel suppliers who can list available fuel products, prices, quantities, and delivery coverage.

Customers can:

* Register and log in
* Browse fuel suppliers
* Compare fuel prices
* View supplier information
* Select a fuel type
* Select a supplier
* Specify quantity
* Provide a delivery location
* Place an order
* Make payment
* Track order progress
* Confirm delivery
* Review the supplier

Suppliers can:

* Register
* Create and manage supplier profiles
* Manage fuel listings
* Set fuel prices
* Set available quantities
* Define delivery areas
* Receive orders
* Accept or reject orders
* Prepare orders
* Arrange delivery
* Update order status
* View relevant order history

Administrators will eventually be able to:

* Manage users
* Manage suppliers
* Verify suppliers
* Manage fuel types
* Monitor listings
* Monitor orders
* Manage platform activity
* Handle administrative operations
* Review platform-level information

---

# 2. Core Product Principle

The Fangoo MVP intentionally keeps the ordering architecture simple.

## One Order = One Supplier

A single order belongs to exactly one supplier.

Do not introduce multi-supplier checkout unless the user explicitly requests it.

Avoid implementing:

* Multi-supplier carts
* Splitting one checkout into multiple supplier orders
* Complex supplier settlement
* Distributed order orchestration
* Microservices
* Advanced logistics orchestration

These may be considered in a future version, but they are outside the MVP unless explicitly requested.

---

# 3. Technology Stack

Fangoo uses the following technology stack.

## Frontend

* Nuxt
* Vue
* TypeScript
* Tailwind CSS

## Backend

* NestJS 12
* TypeScript
* REST API

## Database

* PostgreSQL 18.6

## ORM

* Prisma 7.10.0
* @prisma/client 7.10.0

## Testing

* Vitest
* Supertest
* @nestjs/testing

## Code Quality

* TypeScript
* Prettier
* Oxlint

## Runtime / Package Manager

* Node.js
* npm

## Operating Environment

Development is primarily performed on Windows using PowerShell.

---

# 4. Architecture

Fangoo uses a modular monolith architecture.

```text
Nuxt + Vue + TypeScript + Tailwind
                |
                | REST API
                v
        NestJS Modular Monolith
                |
                | Prisma
                v
          PostgreSQL
```

The architecture should remain simple and maintainable.

Do not introduce microservices unless explicitly requested.

---

# 5. Architectural Principles

## 5.1 DRY — Don't Repeat Yourself

Avoid duplicated:

* Business logic
* Validation rules
* API logic
* Database access patterns
* UI components
* Types
* Constants
* Error handling
* Authentication logic

If the same logic is required in multiple places, determine whether it belongs in:

* A reusable service
* A reusable composable
* A reusable component
* A shared utility
* A shared type
* A shared constant
* A shared module

Do not blindly abstract everything.

The abstraction must improve maintainability.

---

## 5.2 KISS — Keep It Simple

Prefer the simplest solution that correctly satisfies the requirement.

Do not introduce:

* Unnecessary libraries
* Unnecessary abstractions
* Unnecessary design patterns
* Complex state management
* Complex infrastructure
* Microservices
* Event-driven architecture without a real requirement
* Generic frameworks built on top of frameworks
* Premature optimization

Complexity must be justified by a real project requirement.

---

## 5.3 Do Not Skip Steps

Fangoo development should be incremental.

Do not jump over:

* Requirements
* Existing-code inspection
* Architecture decisions
* Validation
* Testing
* Error handling
* Security considerations
* Database design
* Integration verification

When implementing a feature, complete the necessary foundation before moving to dependent functionality.

---

## 5.4 Inspect Before Modifying

Before modifying an existing file:

1. Read the file.
2. Understand its current responsibility.
3. Check related files.
4. Identify existing patterns.
5. Reuse existing functionality where appropriate.
6. Make the smallest reasonable change.
7. Verify the result.

Never overwrite existing architecture simply because another implementation is easier.

---

# 6. Repository Structure

The repository should evolve toward this structure.

```text
fangoo/
│
├── fangoo-frontend/
│   ├── components/
│   ├── composables/
│   ├── pages/
│   ├── stores/
│   ├── types/
│   ├── utils/
│   ├── assets/
│   ├── public/
│   └── ...
│
├── fangoo-backend/
│   ├── src/
│   │   ├── common/
│   │   ├── config/
│   │   ├── prisma/
│   │   ├── modules/
│   │   ├── app.module.ts
│   │   └── main.ts
│   │
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   │
│   ├── prisma7.config.ts
│   ├── .env
│   └── ...
│
└── ...
```

Do not create every directory immediately.

Create directories and modules when they become necessary.

---

# 7. Backend Architecture

The backend uses NestJS as a modular monolith.

The preferred structure is:

```text
src/
├── common/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   ├── decorators/
│   ├── pipes/
│   ├── constants/
│   └── types/
│
├── config/
│
├── prisma/
│
├── modules/
│   ├── auth/
│   ├── users/
│   ├── suppliers/
│   ├── fuel/
│   ├── orders/
│   ├── payments/
│   ├── reviews/
│   └── admin/
│
├── app.module.ts
└── main.ts
```

Do not create all modules at once.

A module should be introduced when its domain functionality is actually being implemented.

---

# 8. Backend Responsibilities

## Controllers

Controllers handle:

* HTTP requests
* Route definitions
* Parameters
* DTO input
* HTTP-level concerns
* Returning service results

Controllers should remain thin.

Do not place substantial business logic inside controllers.

---

## Services

Services contain:

* Business rules
* Application logic
* Validation that depends on business state
* Workflow logic
* Coordination between repositories/services

Services should not contain unnecessary HTTP-specific logic.

---

## Prisma

Prisma should be used for database access.

Do not place raw database queries throughout controllers or unrelated services.

Database access should be centralized and reusable where appropriate.

---

# 9. API Architecture

The backend exposes a REST API.

The global API prefix is:

```text
/api/v1
```

Example:

```text
GET /api/v1/users
POST /api/v1/auth/login
GET /api/v1/orders
POST /api/v1/orders
```

Use resource-oriented REST naming.

Prefer:

```text
GET /orders
GET /orders/:id
POST /orders
PATCH /orders/:id
```

Avoid action-heavy routes unless an action genuinely represents a domain operation.

---

# 10. API Response Format

Successful responses use the global response interceptor.

Expected structure:

```json
{
  "success": true,
  "message": "Request successful",
  "data": {}
}
```

Do not manually wrap every controller response unless there is a specific reason.

The global interceptor handles the standard success envelope.

---

# 11. API Error Format

Errors use the global HTTP exception filter.

Expected structure:

```json
{
  "success": false,
  "message": "Resource not found",
  "error": "Not Found",
  "statusCode": 404,
  "path": "/api/v1/example",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

Do not create unrelated error response formats.

Use NestJS exceptions where appropriate:

* BadRequestException
* UnauthorizedException
* ForbiddenException
* NotFoundException
* ConflictException
* UnprocessableEntityException
* InternalServerErrorException

The exception filter should remain the central mechanism for formatting API errors.

---

# 12. Request Validation

Fangoo uses NestJS ValidationPipe globally.

The intended configuration is:

```typescript
new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
})
```

This means:

* Unknown properties are removed.
* Unexpected properties are rejected.
* DTO transformation is enabled.

All external request input must be treated as untrusted.

Use DTOs for request validation.

Do not rely on frontend validation alone.

---

# 13. Environment Configuration

Environment variables must never be hardcoded.

Sensitive values include:

* Database credentials
* API keys
* Payment secrets
* JWT secrets
* Third-party service credentials

Never commit secrets to Git.

`.env` must remain gitignored.

The backend uses `@nestjs/config` for application configuration.

---

# 14. Database

Fangoo uses:

```text
PostgreSQL 18.6
```

Development database:

```text
fangoo
```

Default local configuration:

```text
host: localhost
port: 5432
database: fangoo
user: postgres
```

Never store the actual database password in source code.

---

# 15. Prisma

Fangoo uses:

```text
Prisma 7.10.0
@prisma/client 7.10.0
```

Do not upgrade to Prisma 8 release candidates unless explicitly instructed.

The project currently uses a Prisma 7 configuration file.

The schema should use:

```prisma
datasource db {
  provider = "postgresql"
}
```

Connection URLs belong in the Prisma configuration.

Do not place:

```prisma
url = env("DATABASE_URL")
```

inside the datasource block when following the project's Prisma 7 configuration.

---

# 16. Prisma Client

The project uses the generated Prisma client.

The generated client is located under:

```text
src/generated/prisma
```

Generated Prisma output should not be committed if the project's `.gitignore` excludes it.

Follow Prisma 7 client-instantiation requirements.

Do not assume Prisma 6 syntax works with Prisma 7.

Before changing Prisma configuration, inspect:

* `package.json`
* `prisma7.config.ts`
* `prisma/schema.prisma`
* Prisma package versions

Do not mix Prisma major-version configuration patterns.

---

# 17. Database Design Process

Database design must happen before implementing the final domain schema.

The preferred workflow is:

```text
Requirements
    ↓
ERD design
    ↓
ERD review
    ↓
Prisma schema
    ↓
Migration
    ↓
Database verification
```

Use dbdiagram.io for the initial ERD when appropriate.

Do not randomly create production domain tables simply to test Prisma.

---

# 18. Initial Domain Model

The likely core entities include:

```text
users
supplier_profiles
fuel_types
supplier_fuels
delivery_areas
supplier_delivery_areas
orders
order_items
payments
order_status_history
reviews
```

These are starting points, not immutable requirements.

Before implementing the final schema:

* Verify relationships.
* Verify cardinality.
* Verify ownership.
* Verify constraints.
* Verify indexes.
* Verify uniqueness.
* Verify deletion behavior.
* Verify status representation.

Do not create duplicate tables for concepts already represented elsewhere.

---

# 19. User Roles

Fangoo will have three primary roles:

```text
CUSTOMER
SUPPLIER
ADMIN
```

Roles must be enforced on the backend.

Never trust a role supplied by the frontend.

Authorization must be checked server-side.

---

# 20. Authentication

Authentication will eventually use:

* Secure password hashing
* JWT-based authentication
* Access control
* Role-based authorization

Passwords must never be stored in plaintext.

Never return password hashes in API responses.

Never expose authentication secrets to the frontend.

Authentication implementation should be centralized rather than duplicated across modules.

---

# 21. Authorization

Authorization must verify both:

1. What the user is allowed to do.
2. Whether the resource belongs to or is accessible by that user.

Examples:

A customer must not be able to:

* Modify another customer's order.
* View another user's private information.
* Change supplier data.

A supplier must not be able to:

* Modify another supplier's listings.
* Modify another supplier's orders.
* Change another supplier's profile.

An admin has elevated platform-level permissions.

Frontend route protection is useful for UX but is not a security boundary.

Backend authorization is mandatory.

---

# 22. Supplier Domain

A supplier has a supplier profile associated with a user.

Supplier functionality includes:

* Supplier profile
* Business information
* Verification state
* Fuel listings
* Fuel prices
* Available quantity
* Delivery coverage
* Order management

Supplier-owned resources must verify ownership on the backend.

Never rely on a frontend-supplied supplier ID without authorization checks.

---

# 23. Fuel Domain

Fuel should be represented as a proper domain concept.

A supplier can offer specific fuel types.

A supplier's fuel listing should contain relevant information such as:

* Fuel type
* Price per litre
* Available quantity
* Availability state
* Supplier ownership

Prices and stock values received from the frontend must never be trusted.

The backend must calculate authoritative order pricing using server-side data.

---

# 24. Inventory

Inventory must be treated as server-owned state.

Never trust the client to determine:

* Available stock
* Current price
* Final order total
* Supplier ownership

Before creating or confirming an order:

1. Verify the supplier.
2. Verify the fuel listing.
3. Verify availability.
4. Verify requested quantity.
5. Obtain the authoritative price.
6. Calculate the total on the backend.
7. Persist the order.

Concurrency must be considered when inventory becomes transactional.

---

# 25. Order Architecture

The MVP uses:

```text
One Order = One Supplier
```

An order should have:

* Customer
* Supplier
* Delivery information
* Order items
* Pricing information
* Payment state
* Order status
* Timestamps
* Status history where appropriate

The backend is the source of truth for all order state.

---

# 26. Order Lifecycle

The intended lifecycle is:

```text
PENDING
    ↓
PAYMENT_PENDING
    ↓
PAID
    ↓
AWAITING_CONFIRMATION
    ↓
CONFIRMED
    ↓
PREPARING
    ↓
OUT_FOR_DELIVERY
    ↓
DELIVERED
```

Terminal or alternative states include:

```text
CANCELLED
REJECTED
REFUND_PENDING
REFUNDED
```

Not every order may pass through every state.

Status transitions must be explicitly controlled.

Do not allow arbitrary status changes from the frontend.

For example, a client must not be allowed to directly change:

```text
PENDING → DELIVERED
```

unless the business rules explicitly permit that transition.

---

# 27. Order State Transitions

Order status changes must be validated server-side.

Use a centralized transition policy rather than duplicating transition checks throughout controllers.

When changing order-state logic:

* Review all valid transitions.
* Review cancellation rules.
* Review payment dependencies.
* Review supplier permissions.
* Review customer permissions.
* Review delivery rules.
* Review refund behavior.

---

# 28. Payments

Payment functionality must be designed with server-side trust boundaries.

Never trust:

* Frontend payment status
* Frontend transaction totals
* Frontend payment references
* Client-supplied confirmation

Payment verification must happen server-side.

The backend must determine:

* Amount owed
* Order total
* Payment status
* Payment reference validity
* Whether the order can advance after payment

Do not mark an order as paid solely because the frontend says payment succeeded.

---

# 29. Delivery

Delivery information should belong to the order.

The system should support:

* Delivery location
* Delivery area validation
* Supplier delivery coverage
* Delivery progress
* Order status updates
* Customer delivery confirmation

Do not build a sophisticated fleet/logistics management system unless explicitly required.

Keep the MVP delivery model simple.

---

# 30. Reviews

Customers can review suppliers after eligible orders are completed.

Review creation must verify:

* The customer owns the order.
* The order belongs to the supplier being reviewed.
* The order is eligible for review.
* The customer has not violated review rules.

Do not allow arbitrary users to create reviews for suppliers they did not transact with.

---

# 31. Frontend Architecture

Fangoo uses Nuxt + Vue + TypeScript.

Recommended structure:

```text
components/
├── ui/
├── layout/
├── fuel/
├── supplier/
├── order/
└── common/

pages/
├── index.vue
├── login.vue
├── register.vue
├── marketplace/
├── orders/
├── supplier/
└── admin/

composables/
├── useAuth.ts
├── useApi.ts
├── useOrders.ts
└── ...

stores/
├── auth.ts
├── cart.ts
└── ...

types/
├── auth.ts
├── fuel.ts
├── supplier.ts
└── order.ts
```

Do not create all directories immediately.

Create them when their functionality is required.

---

# 32. Tailwind CSS

Tailwind CSS is the frontend styling system.

Do not introduce another CSS framework without explicit approval.

Prefer:

* Reusable components
* Tailwind utility classes
* Shared design tokens where appropriate
* Consistent spacing
* Consistent typography
* Responsive layouts
* Accessible interactive states

Avoid unnecessarily large custom CSS files when Tailwind can handle the requirement cleanly.

Do not duplicate long Tailwind class combinations across many components when a reusable component would be more appropriate.

---

# 33. Frontend Components

Reusable UI should live in reusable components.

Examples:

```text
components/ui/Button.vue
components/ui/Input.vue
components/ui/Modal.vue
components/ui/Card.vue
```

Do not create components merely to move a few lines of markup.

Component extraction should improve:

* Reusability
* Readability
* Maintainability
* Consistency

---

# 34. Frontend State

Use local component state for local concerns.

Use composables for reusable logic.

Use stores for genuinely shared application state.

Do not put every piece of state into a global store.

Avoid unnecessary state duplication.

The backend remains the source of truth for server-owned data.

---

# 35. Frontend API Communication

Frontend API communication should be centralized.

Prefer a reusable API composable/client such as:

```text
useApi()
```

rather than repeatedly implementing raw fetch logic throughout pages.

The API layer should handle common concerns such as:

* Base URL
* Headers
* Authentication
* Error handling
* Response envelopes

Do not duplicate API request boilerplate across components.

---

# 36. TypeScript

Use TypeScript throughout Fangoo.

Avoid:

```typescript
any
```

unless there is a strong and documented reason.

Prefer:

* Interfaces
* Type aliases
* Generics
* Explicit API response types
* DTOs
* Shared constants

Types should represent real domain concepts.

Do not create duplicate types that represent exactly the same concept.

---

# 37. Security Rules

Security is a core project requirement.

Always assume frontend input can be manipulated.

Never trust:

* User IDs
* Supplier IDs
* Roles
* Prices
* Quantities
* Payment status
* Order status
* Ownership information
* Permission claims

Validate everything important on the backend.

---

# 38. Secrets

Never commit:

* Database passwords
* JWT secrets
* API keys
* Payment credentials
* Service tokens
* Private keys
* Access tokens

Never print secrets in logs.

Never return secrets through API responses.

Never request that the user paste sensitive credentials into source files.

---

# 39. Database Security

Use parameterized database operations through Prisma.

Do not construct unsafe SQL strings from user input.

If raw SQL is genuinely necessary:

* Parameterize it.
* Validate inputs.
* Explain why Prisma cannot reasonably handle the operation.

---

# 40. Error Handling

Errors should be:

* Predictable
* Structured
* Useful to the client
* Safe to expose

Do not expose:

* Stack traces in production responses
* Database credentials
* Internal secrets
* Sensitive infrastructure details
* Password hashes
* Raw internal exception details when unsafe

Log internal details server-side when appropriate.

---

# 41. Testing

Important business logic must be tested.

Prioritize tests around:

* Authentication
* Authorization
* User ownership
* Supplier ownership
* Fuel availability
* Pricing
* Inventory
* Order creation
* Order status transitions
* Payment verification
* Reviews
* API error handling

Use:

```text
Vitest
Supertest
@nestjs/testing
```

Do not create meaningless tests merely to increase coverage.

Tests should verify actual behavior and important business rules.

---

# 42. API Foundation Tests

The backend foundation should verify at minimum:

* Application starts successfully.
* Global API prefix works.
* Successful response format works.
* Error response format works.
* Validation rejects invalid input.
* Unknown request properties are handled according to ValidationPipe configuration.
* Configuration loads correctly.
* Database connectivity works when Prisma integration is introduced.

---

# 43. CORS

When the frontend and backend run on separate origins during development, configure CORS deliberately.

Do not use unrestricted production CORS such as:

```text
*
```

unless there is a documented reason.

Production origins should be explicitly configured.

---

# 44. Health Check

The backend should eventually expose a simple health endpoint.

Example:

```text
GET /api/v1/health
```

The health endpoint should be lightweight and should not expose sensitive information.

A database health check may be included when appropriate.

---

# 45. Logging

Use structured, useful logging.

Do not log:

* Passwords
* Tokens
* Payment secrets
* Database credentials
* Sensitive personal information unnecessarily

Logs should help diagnose:

* Request failures
* Application failures
* Integration failures
* Important business events

Avoid excessive debug logging in production.

---

# 46. Dependency Management

Before adding a dependency:

1. Check whether the functionality already exists.
2. Check whether the current stack can solve the problem.
3. Check whether an existing dependency can solve it.
4. Add a dependency only when justified.

Avoid dependency bloat.

Do not add libraries simply because they are popular.

---

# 47. Prisma Version Discipline

The project is intentionally using:

```text
Prisma 7.10.0
@prisma/client 7.10.0
```

Keep these versions aligned.

Do not mix:

```text
Prisma 7
```

configuration with:

```text
Prisma 8
```

configuration.

Before changing Prisma:

```text
npm ls prisma @prisma/client
```

Verify the versions.

---

# 48. Git Discipline

Keep commits focused.

Prefer commits such as:

```text
feat: add authentication module
feat: add supplier fuel listings
fix: prevent invalid order status transition
test: add order authorization tests
refactor: centralize API client
chore: configure oxlint
```

Avoid huge commits containing unrelated changes.

Do not commit:

```text
.env
node_modules/
generated build files
temporary test files
```

unless the project explicitly requires them.

---

# 49. Development Workflow

For every meaningful feature, follow this workflow:

```text
1. Understand the requirement
        ↓
2. Inspect existing implementation
        ↓
3. Identify affected modules
        ↓
4. Check existing reusable functionality
        ↓
5. Design the smallest appropriate solution
        ↓
6. Implement backend/domain logic
        ↓
7. Implement frontend integration
        ↓
8. Add validation
        ↓
9. Add error handling
        ↓
10. Add tests
        ↓
11. Run type checking/build/tests
        ↓
12. Review for security
        ↓
13. Review for unnecessary duplication
        ↓
14. Report what changed
```

Do not skip directly from requirement to implementation when existing architecture needs inspection.

---

# 50. Feature Development Order

When a feature spans frontend and backend, prefer:

```text
Database/domain requirements
        ↓
Backend domain model
        ↓
Backend service
        ↓
Backend controller/API
        ↓
Backend tests
        ↓
Frontend API integration
        ↓
Frontend state/composable
        ↓
Frontend UI
        ↓
End-to-end verification
```

Adjust the order when a specific task requires a different sequence, but preserve clear ownership boundaries.

---

# 51. Current Project Phase

The current project is in the **foundation/API phase**.

The foundation work includes:

* NestJS application
* PostgreSQL connection
* Prisma configuration
* Environment configuration
* Global API response format
* Global error handling
* Request validation
* CORS
* Frontend/backend connection
* API conventions
* Health check
* Centralized Prisma service
* API foundation tests
* Cleanup of NestJS starter code
* Foundation review

Do not prematurely implement the entire business domain before the foundation is stable.

---

# 52. Database Phase

After the API foundation is stable:

```text
Epic 02 — Database Design
```

The database process should be:

```text
Requirements review
        ↓
ERD in dbdiagram.io
        ↓
Relationship review
        ↓
Constraint review
        ↓
Prisma schema
        ↓
Migration
        ↓
Database verification
```

Do not skip ERD review.

---

# 53. Expected Future Development Areas

Fangoo is expected to evolve through areas such as:

```text
EPIC 01 — Project Foundation
EPIC 02 — Database Design
EPIC 03 — Authentication
EPIC 04 — User Management
EPIC 05 — Supplier Management
EPIC 06 — Fuel Management
EPIC 07 — Marketplace
EPIC 08 — Orders
EPIC 09 — Payments
EPIC 10 — Delivery
EPIC 11 — Reviews
EPIC 12 — Admin
EPIC 13 — Notifications
EPIC 14 — Testing & Quality
EPIC 15 — Security Hardening
EPIC 16 — Deployment & Production Readiness
```

Do not implement future epics prematurely unless the current task requires them.

---

# 54. Current Backend Foundation

The current backend uses:

```text
NestJS 12
TypeScript
@nestjs/config
Prisma 7.10.0
PostgreSQL 18.6
```

The application uses:

```text
/api/v1
```

as its global API prefix.

The backend already has a standardized successful response interceptor.

The backend already has a standardized HTTP exception filter.

The backend is being prepared for global request validation.

---

# 55. Existing Global Response Interceptor

The project uses a global response interceptor similar to:

```typescript
export interface ApiResponse<T> {
  success: true;
  message: string;
  data: T;
}
```

and returns:

```json
{
  "success": true,
  "message": "Request successful",
  "data": {}
}
```

Do not create a second competing global response format.

---

# 56. Existing Global Exception Filter

The project uses a global HTTP exception filter to standardize errors.

Maintain the standardized structure:

```json
{
  "success": false,
  "message": "...",
  "error": "...",
  "statusCode": 400,
  "path": "...",
  "timestamp": "..."
}
```

If changing this structure, first assess all frontend consumers and API tests.

---

# 57. Starter Code Cleanup

NestJS starter code should eventually be removed or replaced when it is no longer useful.

Examples include:

* Default Hello World service
* Temporary test endpoints
* Temporary debugging code
* Temporary connection scripts

Do not remove starter code blindly.

First verify whether it is still used.

---

# 58. Temporary Files

Temporary files used to verify infrastructure should be removed after successful verification.

Examples:

```text
test-connection.ts
temporary debug routes
temporary scripts
```

Do not leave unnecessary temporary code in production architecture.

---

# 59. Code Review Rules

When reviewing Fangoo code, classify findings by severity.

Prefer:

```text
CRITICAL
HIGH
MEDIUM
LOW
```

For every significant issue, identify:

* Problem
* Why it matters
* Affected file/module
* Recommended fix
* Whether it blocks the current phase

Do not report theoretical problems as confirmed defects.

Distinguish between:

```text
Confirmed defect
Potential risk
Architectural recommendation
Future improvement
```

---

# 60. Refactoring Rules

Refactoring must preserve existing behavior unless behavior change is explicitly required.

Before refactoring:

1. Understand current behavior.
2. Identify dependencies.
3. Identify tests.
4. Determine expected behavior.
5. Refactor incrementally.
6. Run verification.

Do not perform large unrelated refactors while implementing a small feature.

---

# 61. Performance

Do not optimize prematurely.

First make the implementation:

* Correct
* Secure
* Maintainable
* Testable

Then optimize when there is evidence of a performance problem.

Potential future optimization areas include:

* Database indexes
* Query optimization
* Pagination
* Caching
* API payload size
* Frontend rendering
* Image optimization

---

# 62. Pagination

Collection endpoints should eventually use pagination where datasets can become large.

Avoid returning unlimited records from production APIs.

Pagination should be consistent across related endpoints.

---

# 63. API Contract Discipline

The backend API is a contract.

When changing:

* Request fields
* Response fields
* Status codes
* Error formats
* Resource names
* Authentication behavior

check the frontend consumers and tests.

Avoid silently breaking existing clients.

---

# 64. Business Logic Ownership

Business rules belong on the backend.

Examples:

```text
Can this customer place this order?
Can this supplier modify this listing?
Can this order transition to this status?
Is this quantity available?
What is the actual price?
Has payment actually been verified?
Can this customer review this supplier?
```

These must not depend solely on frontend behavior.

---

# 65. Data Integrity

Use database constraints where appropriate.

Consider:

* Unique constraints
* Foreign keys
* Required fields
* Check constraints where supported/appropriate
* Indexes
* Transaction boundaries

Application validation and database constraints should complement each other.

Do not rely exclusively on either one.

---

# 66. Transactions

Use database transactions when multiple related operations must succeed or fail together.

Examples may include:

* Creating an order and its items
* Updating inventory and recording an order
* Payment state changes with related order updates
* Refund state changes

Do not use transactions unnecessarily for simple reads.

---

# 67. Concurrency

Inventory and payment-related operations can involve concurrent requests.

When implementing these areas, consider:

* Race conditions
* Transaction isolation
* Atomic updates
* Duplicate requests
* Idempotency
* Payment callback retries

Do not assume requests will always happen sequentially.

---

# 68. Idempotency

Operations that may be retried by clients or external systems should be designed to avoid unintended duplicate effects.

This is particularly important for:

* Payment callbacks
* Order creation
* Status updates
* External webhook handling

Do not blindly create duplicate records when the same external event is delivered more than once.

---

# 69. External Integrations

When integrating third-party services:

1. Isolate the integration.
2. Keep credentials server-side.
3. Validate responses.
4. Handle failures.
5. Handle retries where appropriate.
6. Avoid coupling the entire application to one provider.

External integrations should not leak provider-specific implementation throughout the domain layer.

---

# 70. Frontend Security

Never assume hiding a UI element provides security.

For example:

```text
if user.role === 'ADMIN'
```

in the frontend is useful for presentation, but the backend must independently enforce the permission.

---

# 71. Accessibility

Frontend interfaces should be accessible.

Consider:

* Semantic HTML
* Keyboard navigation
* Labels
* Focus states
* Accessible buttons
* Form errors
* Color contrast
* Responsive behavior

Do not sacrifice accessibility for visual styling.

---

# 72. Responsive Design

Fangoo should work across:

* Mobile
* Tablet
* Desktop

Use Tailwind responsive utilities.

Design mobile-first where practical.

Do not build desktop-only interfaces unless the feature explicitly requires it.

---

# 73. UI Consistency

Maintain consistent:

* Typography
* Spacing
* Buttons
* Inputs
* Cards
* Modals
* Alerts
* Loading states
* Empty states
* Error states

Create reusable UI primitives when repetition becomes significant.

---

# 74. Loading and Error States

Frontend API-driven interfaces should account for:

```text
Loading
Success
Empty
Error
Retry
```

Do not assume API requests always succeed.

Avoid leaving users with blank screens when an API call fails.

---

# 75. User Experience

Fangoo should prioritize a straightforward ordering experience.

The customer should be able to move through:

```text
Browse
   ↓
Select supplier
   ↓
Select fuel
   ↓
Select quantity
   ↓
Provide delivery information
   ↓
Review order
   ↓
Pay
   ↓
Track order
   ↓
Confirm delivery
```

Avoid unnecessary steps.

---

# 76. Important Non-Goals

Unless explicitly requested, do not introduce:

* Microservices
* Kubernetes
* Event buses
* Complex message brokers
* Multi-supplier checkout
* Complex fleet management
* Cryptocurrency payments
* AI features unrelated to the core product
* Complex recommendation engines
* Premature caching infrastructure
* Multiple databases
* Unnecessary third-party services

The MVP should remain simple.

---

# 77. Decision-Making Rule

When multiple implementation approaches are possible, prefer the option that:

1. Fits the existing architecture.
2. Has fewer moving parts.
3. Has fewer dependencies.
4. Is easier to test.
5. Is easier to understand.
6. Is secure.
7. Can scale reasonably without premature complexity.

---

# 78. When Requirements Are Ambiguous

Do not silently invent important business rules.

If ambiguity affects:

* Money
* Authentication
* Authorization
* Inventory
* Order state
* Payment
* Database relationships
* Data ownership

identify the ambiguity before implementing.

If the ambiguity is minor and a safe default exists, use the simplest reasonable default and document it.

---

# 79. Change Management

Before making a significant architectural change:

Explain:

* Current approach
* Problem with current approach
* Proposed approach
* Why it is better
* Affected areas
* Migration impact
* Risks

Do not silently replace established architecture.

---

# 80. Definition of Done

A Fangoo feature is not considered complete simply because the code compiles.

Where applicable, completion should include:

* Requirement implemented
* Existing architecture preserved
* Validation implemented
* Authorization implemented
* Error handling implemented
* Tests added
* Type checking passes
* Build passes
* Relevant integration verified
* Security reviewed
* No unnecessary duplication
* No unnecessary dependencies
* Temporary code removed
* Documentation updated when necessary

---

# 81. Final Review Checklist

Before considering a task complete, verify:

## Architecture

* Does the implementation fit Fangoo's modular architecture?
* Is the correct module responsible?
* Is business logic in services rather than controllers?

## Backend

* Is input validated?
* Are errors handled consistently?
* Is authorization enforced?
* Is ownership checked?
* Is the API contract clear?

## Database

* Are relationships correct?
* Are constraints appropriate?
* Are transactions needed?
* Are indexes needed?
* Is Prisma being used consistently?

## Frontend

* Is API communication centralized?
* Is state stored at the correct level?
* Is Tailwind used consistently?
* Are loading/error/empty states handled?
* Is the interface responsive?

## Security

* Are secrets protected?
* Is frontend input treated as untrusted?
* Is backend authorization enforced?
* Are payment and order states trusted only from the backend?

## Code Quality

* Is the code DRY?
* Is the implementation simple?
* Is unnecessary abstraction avoided?
* Are unnecessary dependencies avoided?
* Are tests meaningful?

---

# 82. Golden Rules

Always follow these rules when working on Fangoo:

1. **Do not skip steps.**
2. **Inspect before modifying.**
3. **Don't Repeat Yourself.**
4. **Keep It Simple.**
5. **Backend is the source of truth.**
6. **Never trust frontend-controlled business data.**
7. **Never expose secrets.**
8. **Keep controllers thin.**
9. **Keep business logic in services/domain layers.**
10. **Use Prisma consistently.**
11. **Keep Prisma and @prisma/client versions aligned.**
12. **Use PostgreSQL as the database.**
13. **Use Tailwind CSS for frontend styling.**
14. **Use REST for frontend/backend communication.**
15. **One order belongs to one supplier in the MVP.**
16. **Validate order-state transitions server-side.**
17. **Verify payments server-side.**
18. **Verify resource ownership server-side.**
19. **Prefer reusable solutions over duplicated logic.**
20. **Do not introduce complexity without a real requirement.**
21. **Test important business rules.**
22. **Preserve existing behavior when refactoring.**
23. **Do not implement future features prematurely.**
24. **Do not invent important business rules when requirements are ambiguous.**
25. **Verify the result before declaring the task complete.**

---

# 83. Default Agent Behavior

When asked to implement something in Fangoo:

1. Read this skill.
2. Understand the requested task.
3. Inspect the relevant existing files.
4. Determine whether the required functionality already exists.
5. Identify dependencies and affected modules.
6. Explain important architectural decisions when necessary.
7. Implement the smallest correct solution.
8. Follow Fangoo's validation and security rules.
9. Add or update tests where appropriate.
10. Run relevant checks.
11. Review the implementation for duplication and unnecessary complexity.
12. Report exactly what was changed and what was verified.

Do not claim that a task is complete if it has not been verified.

---

# 84. Priority Order

When making implementation decisions, use this priority:

```text
1. Security
2. Correctness
3. Business requirements
4. Data integrity
5. Existing architecture
6. Maintainability
7. Testability
8. Simplicity
9. Performance
10. Convenience
```

Do not sacrifice security or correctness merely to make implementation faster.

---

# 85. Fangoo Development Philosophy

Fangoo should be built as a professional production-oriented application without unnecessary enterprise complexity.

The goal is:

```text
Simple
+
Secure
+
Maintainable
+
Testable
+
Scalable enough
```

not:

```text
Complex
+
Over-engineered
+
Over-abstracted
```

Build what Fangoo needs today while keeping the architecture capable of growing tomorrow.

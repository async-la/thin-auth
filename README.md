### Thin Auth is the working name for a new authentication scheme that provides a framework for secure, passwordless, p2p friendly authentication.

### Key Features
- Double Clad Security (server access token + local key signature)
- Passwordless, Delegated Auth
- Robust Security Rules (generic MFA, read only delegates, “sudo” mode)
- Signed Client Side Content Id’s (ensure ownership and uniqueness)
- P2P Support (defacto because of local keypairs)
- Hybrid P2P Content Subsumption
- Dat App with Identities
- Double Clad Security

#### Double Clad Security
This feature is the key security enhancement over traditional token based authentication. Basically when the auth server signs the client access token, it includes the client’s local public key. When making requests to other services, the client then includes both the access token (used to confirm the centralized identity) as well a local key pair signature of the content itself (used to confirm the token has not been hijacked). This is a huge security enhancement when dealing with untrusted or partially trusted services.

#### Signed Client Side Content Id’s
Client generated content id’s simplify offline first / optimistic UI code. However they are usually avoided in practice because of concerns for conflicts. With a local keypair however we can create provable user generated ids (a user can conflict with themselves, but not others). Potentially these can be generated in a semi-time sortable manner but this requires further investigation.

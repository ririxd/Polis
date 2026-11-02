export default async function hello(): Promise<Response> {
  return new Response("This function has moved to server/neon-function.ts", {
    status: 410,
  });
}

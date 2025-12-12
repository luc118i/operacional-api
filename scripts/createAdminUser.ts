import bcrypt from "bcryptjs";
import { supabase } from "../src/config/upabaseClient";

async function main() {
  const username = "monitoramento";
  const plainPassword = "monitora@#456";

  const passwordHash = await bcrypt.hash(plainPassword, 10);

  const { data, error } = await supabase
    .from("users")
    .insert([
      {
        name: "Operador Monitoramento",
        email: "monitoramento@example.com",
        username,
        password_hash: passwordHash,
        role: "admin", // pode mudar depois se quiser limitar permissões
      },
    ])
    .select();

  if (error) {
    console.error("Erro ao criar usuário:", error);
    process.exit(1);
  }

  process.exit(0);
}

main();

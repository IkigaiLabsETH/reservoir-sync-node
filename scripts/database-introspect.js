/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-undef */
const fs = require('fs');
const MODEL_REGEX = /model [a-zA-Z0-9_]+ {[^}]*}/g;
const SYNC_NODE_MODELS = `

model asks {
    id                      Bytes   @id @db.ByteA
    order_type              String? @db.Text
    order_id                Bytes?  @db.ByteA
    kind                    String? @db.Text
    side                    String? @db.Text
    status                  String? @db.Text
    token_set_id            String? @db.Text
    token_set_schema_hash   Bytes?  @db.ByteA
    contract                Bytes?  @db.ByteA
    maker                   Bytes?  @db.ByteA
    taker                   Bytes?  @db.ByteA
    price_currency_contract Bytes?  @db.ByteA
    price_currency_name     String? @db.Text
    price_currency_symbol   String? @db.Text
    price_currency_decimals Int?    @db.Integer
  
    price_amount_raw     String?  @db.Text
    price_amount_decimal Decimal? @db.Decimal
    price_amount_usd     Decimal? @db.Decimal
    price_amount_native  Decimal? @db.Decimal
  
    price_net_amount_raw     String?  @db.Text
    price_net_amount_decimal Decimal? @db.Decimal
    price_net_amount_usd     Decimal? @db.Decimal
    price_net_amount_native  Decimal? @db.Decimal
  
    valid_from         BigInt? @db.BigInt
    valid_until        BigInt? @db.BigInt
    quantity_filled    BigInt? @db.BigInt
    quantity_remaining BigInt? @db.BigInt
  
    criteria_kind                String? @db.Text
    criteria_data_token_token_id String? @db.Text
  
    source_id     String?   @db.Text
    source_domain String?   @db.Text
    source_name   String?   @db.Text
    source_icon   String?   @db.Text
    source_url    String?   @db.Text
    fee_bps       BigInt?   @db.BigInt
    fee_breakdown Json?     @db.JsonB
    expiration    BigInt?   @db.BigInt
    is_reservoir  Boolean?  @db.Boolean
    is_dynamic    Boolean?  @db.Boolean
    created_at    DateTime? @db.Timestamp
    updated_at    DateTime? @db.Timestamp
  }
  
  model sales {
    id                 Bytes     @id @db.ByteA
    sale_id            Bytes?    @db.ByteA
    token_id           String?   @db.Text
    contract_id        Bytes?    @db.ByteA
    order_id           Bytes?    @db.ByteA
    order_source       String?   @db.Text
    order_side         String?   @db.Text
    order_kind         String?   @db.Text
    from               Bytes?    @db.ByteA
    to                 Bytes?    @db.ByteA
    amount             String?   @db.Text
    fill_source        String?   @db.Text
    block              Int?      @db.Integer
    tx_hash            Bytes?    @db.ByteA
    log_index          Int?      @db.Integer
    batch_index        Int?      @db.Integer
    timestamp          Int?      @db.Integer
    wash_trading_score Float?
    updated_at         DateTime? @default(now())
    created_at         DateTime?
  
    price_currency_contract Bytes?  @db.ByteA
    price_currency_name     String? @db.Text
    price_currency_symbol   String? @db.Text
    price_currency_decimals Int?    @db.Integer
  
    price_amount_raw     String?  @db.Text
    price_amount_decimal Decimal? @db.Decimal
    price_amount_usd     Decimal? @db.Decimal
    price_amount_native  Decimal? @db.Decimal
  }
`;

(() => {
  const oldSchema = fs.readFileSync('prisma/schema.prisma', 'utf-8');

  const ignoredModels = oldSchema.match(MODEL_REGEX).map((match) => {
    const lines = match.split('\n');
    if (!lines.some((str) => str.trim() === '@@ignore')) {
      lines[lines.length - 1] = '\n@@ignore\n}';
    }

    return lines.join('\n');
  });

  const updatedSchema = `
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
${SYNC_NODE_MODELS}

//THESE TABLES WERE INTROSPECTED BY PRISMA FROM THE DATABASE BUT ARE IGNORED ON THE CLIENT
${ignoredModels.join('\n\n')}
`;

  fs.writeFileSync('prisma/schema.prisma', updatedSchema, 'utf-8');
})();

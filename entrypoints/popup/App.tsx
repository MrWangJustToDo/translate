import { Card, CardBody, CardHeader, Divider, Input, Select, SelectItem } from "@heroui/react";
import useSWR from "swr";

import { Logo } from "@/components/logo";
import { useOllamaModal } from "@/hooks/useOllamaModal";
import { useOllamaStatus } from "@/hooks/useOllamaStatus";
import { useSyncConfig } from "@/hooks/useSyncConfig";

const { check } = useOllamaStatus.getActions();

const { loadList } = useOllamaModal.getActions();

function App() {
  const connect = useOllamaStatus((s) => s.state);

  const { url, setUrl } = useOllamaConfig();

  const { selected, setSelected, list } = useOllamaModal();

  useSWR(`state-${url}`, check);

  useSWR(`list-${url}-${connect}`, loadList);

  useSyncConfig({ side: "popup" });

  return (
    <div className="p-2">
      <Card className="min-w-[200px]" radius="sm">
        <CardHeader className="relative flex items-center justify-between">
          <Logo className={`w-[1.8em] ${connect ? "text-green-500" : "text-red-500"}`} />
          Ollama Translate
        </CardHeader>
        <Divider />
        <CardBody>
          <Input label="Ollama api" isRequired value={url} onChange={(s) => setUrl(s.target.value)} />
          <br />
          <Select
            items={list}
            selectedKeys={[selected]}
            onSelectionChange={(s) => setSelected(s.currentKey)}
            label="Modal"
            isDisabled={!connect}
            placeholder="Select a modal"
          >
            {(item) => <SelectItem>{item.label}</SelectItem>}
          </Select>
        </CardBody>
      </Card>
    </div>
  );
}

export default App;

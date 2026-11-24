
import { useEffect, useState } from "react";
import { errorMessage, fileBlob } from "../api";
import type { Attachment } from "../types";

export default function FilePreview({ file, onClose }: { file: Attachment; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    void fileBlob(file.url).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch((failure: unknown) => {
      if (active) setError(errorMessage(failure));
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.url]);

  return (
    <div className="dialog-backdrop" onClick={onClose} onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
      <section className="dialog file-dialog" role="dialog" aria-modal="true" aria-label={file.filename} onClick={(event) => event.stopPropagation()}>
        <div className="dialog-heading">
          <h2>{file.filename}</h2>
          <button type="button" onClick={onClose} aria-label="Close file preview" autoFocus>×</button>
        </div>
        {error && <p role="alert">{error}</p>}
        {!url && !error && <p>Loading document…</p>}
        {url && (
          <>
            {file.content_type === "application/pdf"
              ? <iframe title={file.filename} src={url} />
              : <img src={url} alt={file.filename} />}
            <a href={url} download={file.filename}>Download {file.filename}</a>
          </>
        )}
      </section>
    </div>
  );
}

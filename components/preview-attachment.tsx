import type { Attachment } from 'ai';
import { LoaderIcon } from './icons';

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
}: {
  attachment: Attachment;
  isUploading?: boolean;
}) => {
  const { name, url, contentType } = attachment;

  // Helper to render the correct preview based on contentType
  const renderPreview = () => {
    if (contentType?.startsWith('image/')) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={url}
          src={url}
          alt={name ?? 'Image attachment'}
          className="rounded-md size-full object-cover"
        />
      );
    }

    if (contentType === 'application/pdf') {
      return (
        <iframe
          src={url}
          title={name ?? 'PDF preview'}
          className="w-full h-full rounded-md"
        />
      );
    }

    return (
      <div className="text-xs text-zinc-500 text-center px-1">
        {name ?? 'Unsupported file'}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="w-20 h-16 aspect-video bg-muted rounded-md relative flex items-center justify-center overflow-hidden">
        {renderPreview()}
        {isUploading && (
          <div className="animate-spin absolute text-zinc-500">
            <LoaderIcon />
          </div>
        )}
      </div>
      <div className="text-xs text-zinc-500 max-w-16 truncate">{name}</div>
    </div>
  );
};

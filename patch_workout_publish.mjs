import fs from 'fs';
let content = fs.readFileSync('src/ui/pages/WorkoutBuilder.tsx', 'utf8');

content = content.replace(/<button className="bg-hv-surface-2 text-hv-text-muted px-4 py-2 rounded-md cursor-not-allowed font-medium" disabled>\s*Publish\s*<\/button>/,
`<button 
    onClick={() => setIsPublishModalOpen(true)}
    disabled={validationErrors.length > 0}
    className={\`px-4 py-2 rounded-md font-medium \${validationErrors.length > 0 ? 'bg-hv-surface-2 text-hv-text-muted cursor-not-allowed' : 'bg-hv-primary text-hv-background hover:bg-hv-primary-hover'}\`}
>
    Publish
</button>
{isPublishModalOpen && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-hv-surface-1 p-6 rounded-lg w-[400px]">
            <h2 className="text-xl font-bold mb-4 text-hv-text">Send workout to my apps</h2>
            <div className="space-y-3 mb-6 text-hv-text-muted">
                <p><span className="font-semibold text-hv-text">Discipline:</span> {workout.discipline}</p>
                <p><span className="font-semibold text-hv-text">Blocks:</span> {workout.blocks.length}</p>
            </div>
            {publishStatus && publishStatus !== "Ready" && <p className="mb-4 text-hv-primary">{publishStatus}</p>}
            <div className="flex justify-end gap-3">
                <button onClick={() => setIsPublishModalOpen(false)} className="px-4 py-2 text-hv-text-muted hover:text-hv-text rounded">Cancel</button>
                <button onClick={handlePublish} className="px-4 py-2 bg-hv-primary text-hv-background rounded hover:bg-hv-primary-hover font-medium">Send</button>
            </div>
        </div>
    </div>
)}`);

fs.writeFileSync('src/ui/pages/WorkoutBuilder.tsx', content);

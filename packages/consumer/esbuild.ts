import esbuild from 'esbuild';

async function build() {
    await esbuild.build({
        entryPoints: ['./src/index.ts'],
        bundle: true,
        outfile: './dist/index.js',
        platform: 'node',
        minify: true,
        sourcemap: true,
        preserveSymlinks: true,
        tsconfig: './tsconfig.json',
        resolveExtensions: ['.ts', '.js'],
    });
}

build()
